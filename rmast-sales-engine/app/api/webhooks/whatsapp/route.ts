import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recordInboundMessage } from "@/lib/inbound";

/**
 * WhatsApp Cloud API webhook.
 *
 * GET performs Meta's subscription handshake; POST receives inbound messages
 * and writes them as `direction: "inbound"`, which is what the sentiment and
 * best-time-to-contact reports read.
 */

function verifySignature(rawBody: string, header: string | null, secret: string) {
    if (!header?.startsWith("sha256=")) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(header.slice("sha256=".length));
    const b = Buffer.from(expected);

    return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (
        verifyToken &&
        searchParams.get("hub.mode") === "subscribe" &&
        searchParams.get("hub.verify_token") === verifyToken
    ) {
        return new NextResponse(searchParams.get("hub.challenge") || "", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
        });
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface WhatsAppMessage {
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: {
        button_reply?: { title?: string };
        list_reply?: { title?: string };
    };
}

function extractText(message: WhatsAppMessage): string {
    if (message.text?.body) return message.text.body;
    if (message.button?.text) return message.button.text;
    if (message.interactive?.button_reply?.title) {
        return message.interactive.button_reply.title;
    }
    if (message.interactive?.list_reply?.title) {
        return message.interactive.list_reply.title;
    }
    return `[${message.type || "unsupported"} message]`;
}

export async function POST(request: Request) {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
        return NextResponse.json(
            { error: "WHATSAPP_APP_SECRET is not configured" },
            { status: 501 }
        );
    }

    const rawBody = await request.text();

    if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    try {
        const payload = JSON.parse(rawBody);
        const db = await getDb();

        for (const entry of payload.entry || []) {
            for (const change of entry.changes || []) {
                const messages: WhatsAppMessage[] = change.value?.messages || [];

                for (const message of messages) {
                    await recordInboundMessage(db, {
                        channel: "whatsapp",
                        content: extractText(message),
                        from: message.from,
                        providerMessageId: message.id,
                        receivedAt: message.timestamp
                            ? new Date(Number(message.timestamp) * 1000).toISOString()
                            : undefined,
                    });
                }
            }
        }

        // Meta retries anything that isn't a prompt 200, so acknowledge even
        // when an individual message couldn't be matched to a lead.
        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[webhooks/whatsapp]", error);
        return NextResponse.json({ received: true });
    }
}
