import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { findLeadForInbound, recordInboundMessage } from "@/lib/inbound";
import { suppressLead } from "@/lib/send";

/**
 * Email webhook (Resend / Svix signed).
 *
 * Handles two things the funnel had no way to learn otherwise: replies, and
 * hard bounces or spam complaints — both of which must stop further contact.
 */

const MAX_SKEW_SECONDS = 5 * 60;

/** Verifies a Svix-style signature, as used by Resend webhooks. */
function verifySignature(
    rawBody: string,
    headers: Headers,
    secret: string
): boolean {
    const id = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    const signatureHeader = headers.get("svix-signature");

    if (!id || !timestamp || !signatureHeader) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > MAX_SKEW_SECONDS) return false;

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key)
        .update(`${id}.${timestamp}.${rawBody}`)
        .digest("base64");

    // The header carries a space-separated list of "v1,<signature>" entries so
    // secrets can be rotated without downtime.
    return signatureHeader.split(" ").some((entry) => {
        const [version, signature] = entry.split(",");
        if (version !== "v1" || !signature) return false;
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        return a.length === b.length && timingSafeEqual(a, b);
    });
}

function firstAddress(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    return undefined;
}

export async function POST(request: Request) {
    const secret = process.env.EMAIL_WEBHOOK_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: "EMAIL_WEBHOOK_SECRET is not configured" },
            { status: 501 }
        );
    }

    const rawBody = await request.text();

    if (!verifySignature(rawBody, request.headers, secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: { type?: string; data?: Record<string, unknown> };
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
    }

    try {
        const db = await getDb();
        const data = event.data || {};

        switch (event.type) {
            case "email.bounced":
            case "email.complained": {
                const address = firstAddress(data.to);
                const lead = await findLeadForInbound(db, address);
                if (lead) {
                    await suppressLead(
                        db,
                        lead._id.toString(),
                        lead.email,
                        event.type === "email.bounced" ? "hard bounce" : "spam complaint"
                    );
                }
                break;
            }

            case "email.received":
            case "inbound.email": {
                await recordInboundMessage(db, {
                    channel: "email",
                    content: String(data.text || data.html || data.subject || ""),
                    from: firstAddress(data.from),
                    providerMessageId: data.email_id
                        ? String(data.email_id)
                        : (request.headers.get("svix-id") ?? undefined),
                    receivedAt: data.created_at ? String(data.created_at) : undefined,
                });
                break;
            }

            default:
                // Delivery and open events aren't acted on, but acknowledging
                // them keeps the provider from retrying.
                break;
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[webhooks/email]", error);
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
