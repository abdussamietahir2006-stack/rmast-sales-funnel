import { Db } from "mongodb";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Reads the operator's Gmail inbox over IMAP with the same App Password used
 * for sending, so the engine can see replies without depending on a
 * connector being loaded in whatever session runs it.
 *
 * Deliberately narrow: the mailbox is opened read-only (nothing is marked
 * read, moved or deleted), and only three kinds of message come back:
 * replies from addresses we have emailed, Google Calendar booking
 * notifications, and delivery-failure bounces that mention one of those
 * addresses. Everything else in the inbox is never returned.
 */

export type InboxKind = "reply" | "booking" | "bounce";

export interface InboxMessage {
    kind: InboxKind;
    /** The lead it belongs to, when the sender or bounce matches one. */
    leadId: string | null;
    companyName: string | null;
    from: string;
    subject: string;
    receivedAt: string;
    /** RFC Message-ID header: unique, so it doubles as the provider id. */
    messageId: string;
    /** The new text only, with quoted earlier messages stripped. */
    text: string;
}

const MAX_TEXT = 4000;
const CALENDAR_SENDERS = /calendar-notification@google\.com|noreply@google\.com/i;
const BOUNCE_SENDERS = /mailer-daemon|postmaster/i;

export function inboxConfigured(): boolean {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** Drops the quoted thread under a reply ("On ... wrote:", "> " lines, Gmail's
 *  divider), keeping just what the person actually wrote this time. */
function newTextOnly(text: string): string {
    const lines = text.replace(/\r/g, "").split("\n");
    const kept: string[] = [];
    for (const line of lines) {
        if (/^On .+ wrote:\s*$/i.test(line.trim())) break;
        if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
        if (/^From: .+/i.test(line.trim()) && kept.length > 0) break;
        if (line.startsWith(">")) continue;
        kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
}

/**
 * Inbox messages from the last `days` days that the engine needs.
 * `leadEmails` maps a lowercased address to its lead.
 */
export async function readInbox(
    leadEmails: Map<string, { id: string; companyName: string }>,
    days: number
): Promise<InboxMessage[]> {
    const client = new ImapFlow({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
        logger: false,
    });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results: InboxMessage[] = [];

    await client.connect();
    try {
        const lock = await client.getMailboxLock("INBOX", { readOnly: true });
        try {
            const uids = await client.search({ since }, { uid: true });
            if (!uids || uids.length === 0) return [];

            // Envelopes first (cheap), then full source only for matches.
            const wanted: { uid: number; kind: InboxKind; from: string }[] = [];
            for await (const msg of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
                const from = (msg.envelope?.from?.[0]?.address || "").toLowerCase();
                const subject = msg.envelope?.subject || "";
                if (leadEmails.has(from)) wanted.push({ uid: msg.uid, kind: "reply", from });
                else if (CALENDAR_SENDERS.test(from) && /appointment|booked|invitation|call with/i.test(subject)) {
                    wanted.push({ uid: msg.uid, kind: "booking", from });
                } else if (BOUNCE_SENDERS.test(from)) wanted.push({ uid: msg.uid, kind: "bounce", from });
            }

            for (const item of wanted) {
                const msg = await client.fetchOne(String(item.uid), { source: true }, { uid: true });
                if (!msg || !msg.source) continue;
                const parsed = await simpleParser(msg.source);
                const body = parsed.text || "";

                let lead = item.kind === "reply" ? leadEmails.get(item.from) || null : null;
                if (!lead) {
                    // Bookings and bounces name the lead's address in the body.
                    const mentioned = [...leadEmails.keys()].find((email) => body.toLowerCase().includes(email));
                    lead = mentioned ? leadEmails.get(mentioned) || null : null;
                }
                // A bounce about someone we never emailed is none of our business.
                if (item.kind === "bounce" && !lead) continue;

                results.push({
                    kind: item.kind,
                    leadId: lead?.id || null,
                    companyName: lead?.companyName || null,
                    from: item.from,
                    subject: parsed.subject || "",
                    receivedAt: (parsed.date || new Date()).toISOString(),
                    messageId: parsed.messageId || `imap-uid-${item.uid}`,
                    text: item.kind === "reply" ? newTextOnly(body) : body.slice(0, MAX_TEXT),
                });
            }
        } finally {
            lock.release();
        }
    } finally {
        await client.logout().catch(() => undefined);
    }

    return results.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

/** Every address the engine has emailed, mapped to its lead. */
export async function emailedLeadAddresses(db: Db) {
    const leadIds: string[] = await db
        .collection("messages")
        .distinct("leadId", { channel: "email", direction: "outbound" });
    const { ObjectId } = await import("mongodb");
    const leads = await db
        .collection("leads")
        .find(
            { _id: { $in: leadIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } },
            { projection: { email: 1, companyName: 1 } }
        )
        .toArray();
    const map = new Map<string, { id: string; companyName: string }>();
    for (const lead of leads) {
        if (lead.email) map.set(String(lead.email).toLowerCase(), { id: lead._id.toString(), companyName: lead.companyName });
    }
    return map;
}

/** Which of these messages are already recorded, so a rerun doesn't repeat. */
export async function alreadyRecorded(db: Db, messageIds: string[]): Promise<Set<string>> {
    const docs = await db
        .collection("messages")
        .find({ $or: [{ providerMessageId: { $in: messageIds } }, { internetMessageId: { $in: messageIds } }] }, { projection: { providerMessageId: 1, internetMessageId: 1 } })
        .toArray();
    return new Set(docs.flatMap((d) => [d.providerMessageId, d.internetMessageId].filter(Boolean) as string[]));
}
