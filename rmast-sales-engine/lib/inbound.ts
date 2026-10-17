import { Db, ObjectId } from "mongodb";
import { callGeminiJson } from "@/lib/ai";
import { Channel, suppressLead } from "@/lib/send";
import { logActivity } from "@/lib/pipeline";

/**
 * Recording inbound replies.
 *
 * Nothing ever wrote `direction: "inbound"`, so the Reply Sentiment and Best
 * Time to Contact pages filtered an always-empty set — they looked broken but
 * were simply never fed. Provider webhooks land here.
 */

export type Sentiment = "Positive" | "Neutral" | "Negative" | "Not Interested";

const SENTIMENTS: Sentiment[] = [
    "Positive",
    "Neutral",
    "Negative",
    "Not Interested",
];

/** Statuses an inbound reply is allowed to advance a lead out of. */
const ADVANCEABLE_STATUSES = ["New", "Analyzing", "Analyzed", "Contacted"];

async function classifySentiment(content: string): Promise<Sentiment | undefined> {
    if (!process.env.AI_API_KEY) return undefined;

    try {
        const result = await callGeminiJson<{ sentiment: string }>(
            `Classify the sentiment of this reply to a cold sales outreach message.

"""
${content.slice(0, 2000)}
"""

Choose exactly one: "Positive" (interested, asking questions, wants to talk),
"Neutral" (acknowledgement, or a question with no signal either way),
"Negative" (annoyed or hostile), "Not Interested" (a clear decline, or a
request to stop contacting them).

Return JSON exactly: { "sentiment": "one of the four values" }`
        );

        const sentiment = result.sentiment as Sentiment;
        return SENTIMENTS.includes(sentiment) ? sentiment : undefined;
    } catch (error) {
        console.warn("[inbound] sentiment classification failed:", String(error));
        return undefined;
    }
}

export interface InboundMessage {
    channel: Channel;
    content: string;
    /** Provider-side id, used to make webhook delivery idempotent. */
    providerMessageId?: string;
    /** Sender address or phone number, used to find the lead. */
    from?: string;
    receivedAt?: string;
    /** Set when whoever recorded the reply (the engine) already matched the
     *  lead and judged the sentiment; skips the lookup and the AI classifier. */
    leadId?: string;
    sentiment?: Sentiment;
}

/** Finds the lead an inbound message belongs to, by email or phone. */
export async function findLeadForInbound(db: Db, from: string | undefined) {
    if (!from) return null;

    const address = from.trim().toLowerCase();
    const digits = from.replace(/[^\d]/g, "");

    if (address.includes("@")) {
        const byEmail = await db.collection("leads").findOne({ email: address });
        if (byEmail) return byEmail;
    }

    if (digits.length >= 7) {
        // Phone numbers are stored as the provider gave them, so match on the
        // last 9 digits to survive country-code and formatting differences.
        const tail = digits.slice(-9);
        const leads = await db
            .collection("leads")
            .find({ phone: { $regex: `${tail}$` } })
            .limit(1)
            .toArray();
        if (leads[0]) return leads[0];
    }

    return null;
}

export async function recordInboundMessage(
    db: Db,
    message: InboundMessage
): Promise<{ recorded: boolean; reason?: string }> {
    const content = message.content.trim();
    if (!content) return { recorded: false, reason: "empty message" };

    // Providers retry webhooks, so the same reply can arrive more than once.
    if (message.providerMessageId) {
        const existing = await db
            .collection("messages")
            .findOne({ providerMessageId: message.providerMessageId });
        if (existing) return { recorded: false, reason: "duplicate" };
    }

    const lead =
        message.leadId && ObjectId.isValid(message.leadId)
            ? await db.collection("leads").findOne({ _id: new ObjectId(message.leadId) })
            : await findLeadForInbound(db, message.from);
    if (!lead) {
        // Keep it — an unmatched reply is still worth seeing.
        await db.collection("unmatchedInbound").insertOne({
            ...message,
            content,
            receivedAt: message.receivedAt || new Date().toISOString(),
        });
        return { recorded: false, reason: "no matching lead" };
    }

    const leadId = lead._id.toString();
    const sentiment =
        message.sentiment && SENTIMENTS.includes(message.sentiment)
            ? message.sentiment
            : await classifySentiment(content);

    await db.collection("messages").insertOne({
        leadId,
        channel: message.channel,
        direction: "inbound",
        content,
        sentiment,
        providerMessageId: message.providerMessageId,
        sentAt: message.receivedAt || new Date().toISOString(),
    });

    if (ADVANCEABLE_STATUSES.includes(lead.status)) {
        await db
            .collection("leads")
            .updateOne(
                { _id: lead._id },
                { $set: { status: "Replied", firstReplyAt: new Date().toISOString() } }
            );
    }

    await logActivity(
        db,
        leadId,
        "replied",
        `Reply received via ${message.channel}${sentiment ? ` (${sentiment})` : ""}`
    );

    // A clear decline is an opt-out. Honouring it automatically is both the
    // decent thing and what PECR/CASL/CAN-SPAM expect.
    if (sentiment === "Not Interested") {
        await suppressLead(db, leadId, lead.email, "replied not interested");
    }

    return { recorded: true };
}
