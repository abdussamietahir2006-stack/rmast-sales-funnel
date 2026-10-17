import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeEngine } from "@/lib/engine";
import { alreadyRecorded, emailedLeadAddresses, inboxConfigured, readInbox } from "@/lib/inbox";

export const maxDuration = 60;

/**
 * New inbox messages the engine needs to act on: replies from emailed leads,
 * calendar booking notifications and bounces, each marked `recorded` if it is
 * already in the app. ?days= sets how far back to look (default 14, max 60).
 */
export async function GET(request: Request) {
    if (!authorizeEngine(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!inboxConfigured()) {
        return NextResponse.json({ error: "Inbox reading needs GMAIL_USER and GMAIL_APP_PASSWORD." }, { status: 501 });
    }
    try {
        const days = Math.min(60, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14));
        const db = await getDb();
        const addresses = await emailedLeadAddresses(db);
        if (addresses.size === 0) return NextResponse.json({ messages: [] });

        const messages = await readInbox(addresses, days);
        const recorded = await alreadyRecorded(db, messages.map((m) => m.messageId));
        return NextResponse.json({
            messages: messages.map((m) => ({ ...m, recorded: recorded.has(m.messageId) })),
        });
    } catch (error) {
        console.error("[engine/inbox]", error);
        return NextResponse.json({ error: `Could not read the inbox: ${String(error)}` }, { status: 502 });
    }
}
