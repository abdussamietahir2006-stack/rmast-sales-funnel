import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { findCompetitorsForLead, getLead } from "@/lib/pipeline";

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

        const result = await findCompetitorsForLead(db, lead);
        if (!result.ok) {
            return NextResponse.json({ error: result.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, ...result.data });
    } catch (error) {
        console.error("[leads/competitors]", error);
        return NextResponse.json(
            { error: "Competitor lookup failed" },
            { status: 500 }
        );
    }
}
