import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { authorizeEngine, retireLead } from "@/lib/engine";

/** Removes a lead that never replied after every follow-up; refused for any
 *  lead that isn't due for removal. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!authorizeEngine(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    try {
        const result = await retireLead(await getDb(), id);
        return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    } catch (error) {
        console.error("[engine/leads/:id/retire]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
