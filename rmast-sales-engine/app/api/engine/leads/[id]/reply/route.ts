import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { authorizeEngine, recordReply } from "@/lib/engine";

/** A reply found in the operator's inbox:
 *  { content, receivedAt, sentiment, providerMessageId }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });

    try {
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(await recordReply(await getDb(), id, body));
    } catch (error) {
        console.error("[engine/leads/:id/reply]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
