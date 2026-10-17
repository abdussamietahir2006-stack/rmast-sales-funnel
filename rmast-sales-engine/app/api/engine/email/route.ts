import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
    authorizeEngine,
    getEmailThreads,
    FOLLOW_UP_EVERY_DAYS,
    MAX_CONVERSATION_NUDGES,
    MAX_FOLLOW_UPS,
    RETIRE_AFTER_DAYS,
} from "@/lib/engine";

/** Every emailed lead with its full thread and the next step that is due:
 *  reply, follow-up, nudge, or retire. */
export async function GET(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const threads = await getEmailThreads(await getDb());
        return NextResponse.json({
            rules: {
                followUpEveryDays: FOLLOW_UP_EVERY_DAYS,
                maxFollowUps: MAX_FOLLOW_UPS,
                retireAfterDays: RETIRE_AFTER_DAYS,
                maxConversationNudges: MAX_CONVERSATION_NUDGES,
            },
            replyTo: process.env.GMAIL_USER || process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || null,
            threads,
        });
    } catch (error) {
        console.error("[engine/email]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
