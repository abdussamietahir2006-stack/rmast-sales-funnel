import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLead, verifyLeadActivity } from "@/lib/pipeline";

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const lead = await getLead(db, id);
        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        const result = await verifyLeadActivity(db, lead);
        if (!result.ok) {
            return NextResponse.json(
                { error: result.message },
                { status: result.quotaExhausted ? 429 : 500 }
            );
        }

        return NextResponse.json({ success: true, ...result.data });
    } catch (error) {
        console.error("[leads/verify-activity]", error);
        return NextResponse.json(
            { error: "Activity verification failed" },
            { status: 500 }
        );
    }
}
