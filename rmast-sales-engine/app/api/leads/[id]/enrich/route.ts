import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { enrichLead, getLead } from "@/lib/pipeline";

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

        const result = await enrichLead(db, lead);
        if (!result.ok) {
            return NextResponse.json({ error: result.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, ...result.data });
    } catch (error) {
        console.error("[leads/enrich]", error);
        return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
    }
}
