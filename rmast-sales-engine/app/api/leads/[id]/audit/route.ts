import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateAudit, getLead } from "@/lib/pipeline";

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

        const result = await generateAudit(db, lead);
        if (!result.ok) {
            return NextResponse.json(
                { error: result.message },
                { status: result.quotaExhausted ? 429 : 400 }
            );
        }

        return NextResponse.json({ success: true, ...result.data });
    } catch (error) {
        console.error("[leads/audit]", error);
        return NextResponse.json({ error: "Audit generation failed" }, { status: 500 });
    }
}
