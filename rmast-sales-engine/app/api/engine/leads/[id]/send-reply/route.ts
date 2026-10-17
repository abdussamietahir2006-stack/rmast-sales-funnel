import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { authorizeEngine, sendConversationReply } from "@/lib/engine";

/** The engine's answer in an ongoing conversation, { content }; refused
 *  unless the lead's reply is waiting or a nudge is due. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!authorizeEngine(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    try {
        const body = await request.json().catch(() => ({}));
        const result = await sendConversationReply(await getDb(), id, body.content);
        return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    } catch (error) {
        console.error("[engine/leads/:id/send-reply]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
