import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeEngine, getEmailThreads, FOLLOW_UP_DELAYS_DAYS } from "@/lib/engine";

/** Every emailed lead: replied or not, follow-ups sent, and whether the next
 *  follow-up is due. */
export async function GET(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const threads = await getEmailThreads(await getDb());
        return NextResponse.json({
            followUpDelaysDays: FOLLOW_UP_DELAYS_DAYS,
            replyTo: process.env.GMAIL_USER || process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || null,
            threads,
        });
    } catch (error) {
        console.error("[engine/email]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
