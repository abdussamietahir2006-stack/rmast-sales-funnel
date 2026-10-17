import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { authorizeEngine, recordMeeting } from "@/lib/engine";

/** A meeting the lead booked: { scheduledAt: ISO date, notes }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!authorizeEngine(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    try {
        const body = await request.json().catch(() => ({}));
        const result = await recordMeeting(await getDb(), id, body);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    } catch (error) {
        console.error("[engine/leads/:id/meeting]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
