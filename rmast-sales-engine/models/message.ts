export type MessageChannel =
    | "email"
    | "whatsapp"
    | "instagram"
    | "facebook"
    | "linkedin";

export type MessageSentiment =
    | "Positive"
    | "Neutral"
    | "Negative"
    | "Not Interested";

export interface Message {
    _id?: string;
    leadId: string;
    channel: MessageChannel;
    direction: "outbound" | "inbound";
    content: string;
    /** Set on inbound replies by the sentiment classifier. */
    sentiment?: MessageSentiment;
    /** Provider-side id, used to make webhook delivery idempotent. */
    providerMessageId?: string;
    /** "api" for a real send, "manual" for a channel logged by hand. */
    deliveredVia?: "api" | "manual";
    sentAt: string;
}
