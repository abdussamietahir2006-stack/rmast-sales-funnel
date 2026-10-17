import { Db, ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import { Lead, logActivity } from "@/lib/pipeline";
import { signValue } from "@/lib/signing";
import { publicAppUrl, withPublicLinks } from "@/lib/app-url";

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
    return publicAppUrl();
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

export interface EmailOptions {
    /** Message-ID of an earlier email in the thread, so a follow-up shows up
     *  as a reply to it in the recipient's inbox (Gmail sending only). */
    inReplyTo?: string;
}

/** Gmail sending is configured: the operator's own mailbox sends, and replies
 *  come straight back to it. */
function gmailConfigured(): boolean {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

async function sendEmail(lead: Lead, content: string, options: EmailOptions = {}): Promise<SendResult> {
    const useGmail = gmailConfigured();
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!useGmail && (!apiKey || !from)) {
        return {
            ok: false,
            notConfigured: true,
            message:
                "Email sending is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD (send from your Gmail), or EMAIL_API_KEY and EMAIL_FROM (Resend).",
        };
    }

    if (!lead.email) {
        return { ok: false, message: "This lead has no email address." };
    }

    const leadId = lead._id.toString();
    // Drafts written before deployment may still carry localhost links.
    const { subject, body } = splitSubject(withPublicLinks(content), lead.companyName);
    const optOut = unsubscribeUrl(leadId);

    const html = `${body
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("\n")}
<p style="font-size:12px;color:#6b7280;margin-top:24px">
  Not interested? <a href="${optOut}">Unsubscribe</a> and we won't contact you again.
</p>`;
    const text = `${body}\n\n---\nUnsubscribe: ${optOut}`;
    const unsubscribeHeaders = {
        // Required for bulk mail by Gmail and Yahoo, and the clearest
        // opt-out signal under CAN-SPAM and PECR.
        "List-Unsubscribe": `<${optOut}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    if (useGmail) {
        return sendViaGmail(lead.email, subject, html, text, unsubscribeHeaders, options);
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: [lead.email],
            // Lets replies land in an inbox the operator (and the engine) reads,
            // when the sending address itself has no mailbox behind it.
            ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
            subject,
            html,
            text,
            headers: unsubscribeHeaders,
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

/**
 * Sends through the operator's Gmail account over SMTP, using a Google App
 * Password (never the account password). The email appears in their Gmail
 * Sent folder, replies arrive in their inbox, and the returned Message-ID
 * lets follow-ups thread under the original.
 */
async function sendViaGmail(
    to: string,
    subject: string,
    html: string,
    text: string,
    headers: Record<string, string>,
    options: EmailOptions
): Promise<SendResult> {
    const user = process.env.GMAIL_USER!;
    const transport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    });

    try {
        const info = await transport.sendMail({
            from: { name: process.env.EMAIL_FROM_NAME || "RMAST STUDIO", address: user },
            to,
            subject,
            html,
            text,
            headers,
            ...(options.inReplyTo ? { inReplyTo: options.inReplyTo, references: [options.inReplyTo] } : {}),
        });
        return { ok: true, message: `Email sent to ${to}`, providerMessageId: info.messageId };
    } catch (error) {
        return { ok: false, message: `Gmail rejected the send: ${String(error)}` };
    } finally {
        transport.close();
    }
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
    content: string,
    emailOptions: EmailOptions = {}
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
        result = await sendEmail(lead, content, emailOptions);
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
