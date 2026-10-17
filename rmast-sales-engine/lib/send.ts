import { Db, ObjectId } from "mongodb";
import { Lead, logActivity } from "@/lib/pipeline";
import { signValue } from "@/lib/signing";

/**
 * Outbound message delivery.
 *
 * The messages route used to log a message, mark the lead Contacted, and send
 * nothing — the funnel had no exit. Email goes out through Resend and WhatsApp
 * through the Meta Cloud API, both gated behind their API keys so an
 * unconfigured deployment fails loudly rather than pretending to have sent.
 *
 * Cold outreach is regulated (GDPR/PECR in the EU and UK, CASL in Canada,
 * CAN-SPAM in the US). Two guards sit in front of every send:
 *   - a human approval step, so nothing is auto-sent unreviewed, and
 *   - a suppression list, so an unsubscribe is honoured permanently.
 */

export const AUTO_SEND_CHANNELS = ["email", "whatsapp"] as const;
export const MANUAL_CHANNELS = ["instagram", "facebook", "linkedin"] as const;
export const ALL_CHANNELS = [...AUTO_SEND_CHANNELS, ...MANUAL_CHANNELS];

export type Channel = (typeof ALL_CHANNELS)[number];

export interface SendResult {
    ok: boolean;
    message: string;
    /** Provider-side id, stored so webhook events can be matched back. */
    providerMessageId?: string;
    /** True when the failure is configuration, not a transient error. */
    notConfigured?: boolean;
}

function appUrl(): string {
    return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export function unsubscribeUrl(leadId: string): string {
    return `${appUrl()}/api/public/unsubscribe?token=${signValue("unsubscribe", leadId)}`;
}

// --- Suppression ----------------------------------------------------------

/** True when this lead has opted out and must not be contacted again. */
export async function isSuppressed(db: Db, lead: Lead): Promise<boolean> {
    if (lead.optedOut) return true;
    if (!lead.email) return false;

    const hit = await db
        .collection("suppressions")
        .findOne({ email: String(lead.email).toLowerCase() });

    return hit !== null;
}

export async function suppressLead(
    db: Db,
    leadId: string,
    email: string | undefined,
    reason: string
): Promise<void> {
    await db.collection("leads").updateOne(
        { _id: new ObjectId(leadId) },
        {
            $set: {
                optedOut: true,
                optedOutAt: new Date().toISOString(),
                optedOutReason: reason,
            },
        }
    );

    if (email) {
        await db.collection("suppressions").updateOne(
            { email: email.toLowerCase() },
            {
                $set: { email: email.toLowerCase(), reason },
                $setOnInsert: { createdAt: new Date().toISOString() },
            },
            { upsert: true }
        );
    }

    await logActivity(db, leadId, "opted_out", `Opted out of outreach (${reason})`);
}

// --- Email (Resend) -------------------------------------------------------

/** Splits a generated message into a subject line and body. */
function splitSubject(content: string, companyName: string): {
    subject: string;
    body: string;
} {
    const match = content.match(/^\s*subject:\s*(.+?)\r?\n([\s\S]*)$/i);
    if (match) {
        return { subject: match[1].trim(), body: match[2].trim() };
    }
    return { subject: `A quick note about ${companyName}`, body: content.trim() };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function sendEmail(lead: Lead, content: string): Promise<SendResult> {
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
        return {
            ok: false,
            notConfigured: true,
            message:
                "Email sending is not configured. Add EMAIL_API_KEY and EMAIL_FROM to enable it.",
        };
    }

    if (!lead.email) {
        return { ok: false, message: "This lead has no email address." };
    }

    const leadId = lead._id.toString();
    const { subject, body } = splitSubject(content, lead.companyName);
    const optOut = unsubscribeUrl(leadId);

    const html = `${body
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("\n")}
<p style="font-size:12px;color:#6b7280;margin-top:24px">
  Not interested? <a href="${optOut}">Unsubscribe</a> and we won't contact you again.
</p>`;

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: [lead.email],
            subject,
            html,
            text: `${body}\n\n---\nUnsubscribe: ${optOut}`,
            headers: {
                // Required for bulk mail by Gmail and Yahoo, and the clearest
                // opt-out signal under CAN-SPAM and PECR.
                "List-Unsubscribe": `<${optOut}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, message: `Email provider rejected the send: ${res.status} ${detail}` };
    }

    const data = await res.json().catch(() => ({}));
    return {
        ok: true,
        message: `Email sent to ${lead.email}`,
        providerMessageId: data?.id,
    };
}

// --- WhatsApp (Meta Cloud API) --------------------------------------------

async function sendWhatsApp(lead: Lead, content: string): Promise<SendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        return {
            ok: false,
            notConfigured: true,
            message:
                "WhatsApp sending is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to enable it.",
        };
    }

    if (!lead.phone) {
        return { ok: false, message: "This lead has no phone number." };
    }

    const to = String(lead.phone).replace(/[^\d]/g, "");
    if (!to) {
        return { ok: false, message: "This lead's phone number is not dialable." };
    }

    const version = process.env.WHATSAPP_API_VERSION || "v21.0";
    const res = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "text",
                text: { preview_url: true, body: content },
            }),
            signal: AbortSignal.timeout(20_000),
        }
    );

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
            ok: false,
            message: `WhatsApp API rejected the send: ${res.status} ${detail}`,
        };
    }

    const data = await res.json().catch(() => ({}));
    return {
        ok: true,
        message: `WhatsApp message sent to ${to}`,
        providerMessageId: data?.messages?.[0]?.id,
    };
}

// --- Entry point ----------------------------------------------------------

/**
 * Delivers one message and records it.
 *
 * `instagram`, `facebook` and `linkedin` have no unattended-send API for cold
 * outreach, so those are recorded as sent-by-hand rather than dispatched.
 */
export async function sendMessage(
    db: Db,
    lead: Lead,
    channel: Channel,
    content: string
): Promise<SendResult> {
    const leadId = lead._id.toString();

    if (await isSuppressed(db, lead)) {
        return {
            ok: false,
            message: "This lead has opted out of contact and cannot be messaged.",
        };
    }

    let result: SendResult;

    if (channel === "email") {
        result = await sendEmail(lead, content);
    } else if (channel === "whatsapp") {
        result = await sendWhatsApp(lead, content);
    } else {
        result = {
            ok: true,
            message: `Logged as manually sent on ${channel}.`,
        };
    }

    if (!result.ok) return result;

    await db.collection("messages").insertOne({
        leadId,
        channel,
        direction: "outbound",
        content,
        providerMessageId: result.providerMessageId,
        deliveredVia: AUTO_SEND_CHANNELS.includes(channel as never) ? "api" : "manual",
        sentAt: new Date().toISOString(),
    });

    // Only move status forward, never backward — e.g. don't demote a
    // "Qualified" lead back to "Contacted" if they get a follow-up message.
    const forwardableStatuses = ["New", "Analyzing", "Analyzed"];
    if (forwardableStatuses.includes(lead.status)) {
        await db
            .collection("leads")
            .updateOne(
                { _id: new ObjectId(leadId) },
                { $set: { status: "Contacted", firstContactedAt: new Date().toISOString() } }
            );
    }

    await logActivity(db, leadId, "contacted", `Contacted via ${channel}`);

    return result;
}
