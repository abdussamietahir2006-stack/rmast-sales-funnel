import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { ALL_CHANNELS } from "@/lib/send";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/**
 * Messages for one channel, with the lead attached for display.
 *
 * This lives at `/api/messages` — the five channel inbox pages have always
 * requested that path, while the route file was `/api/message`, so every
 * inbox was quietly getting a 404.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const channel = searchParams.get("channel");
        const direction = searchParams.get("direction");

        if (!channel) {
            return NextResponse.json(
                { error: "channel query param is required" },
                { status: 400 }
            );
        }

        if (!ALL_CHANNELS.includes(channel as never)) {
            return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
        }

        const limit = Math.min(
            Number(searchParams.get("limit")) || DEFAULT_LIMIT,
            MAX_LIMIT
        );

        const db = await getDb();

        const query: Record<string, unknown> = { channel };
        if (direction === "inbound" || direction === "outbound") {
            query.direction = direction;
        }

        const messages = await db
            .collection("messages")
            .find(query)
            .sort({ sentAt: -1 })
            .limit(limit)
            .toArray();

        // Attach basic lead info to each message for display. `demoHtml` is a
        // full generated page — excluded so an inbox doesn't ship megabytes.
        const leadIds = [...new Set(messages.map((m) => m.leadId as string))].filter(
            (id) => ObjectId.isValid(id)
        );

        const leads = await db
            .collection("leads")
            .find(
                { _id: { $in: leadIds.map((id) => new ObjectId(id)) } },
                { projection: { demoHtml: 0, outreachMessages: 0 } }
            )
            .toArray();

        const leadMap = new Map(leads.map((l) => [l._id.toString(), l]));

        const enriched = messages.map((m) => ({
            ...m,
            lead: leadMap.get(m.leadId as string) || null,
        }));

        return NextResponse.json({ messages: enriched });
    } catch (error) {
        console.error("[messages]", error);
        return NextResponse.json(
            { error: "Could not load messages" },
            { status: 500 }
        );
    }
}
