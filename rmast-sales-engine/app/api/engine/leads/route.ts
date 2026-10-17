import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addLeads, authorizeEngine } from "@/lib/engine";

/** New leads Claude found with web search: { leads: [...], campaignId? }. */
export async function POST(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let body: { leads?: unknown; campaignId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }

    try {
        const campaignId = typeof body.campaignId === "string" ? body.campaignId : undefined;
        return NextResponse.json(await addLeads(await getDb(), body.leads, campaignId));
    } catch (error) {
        console.error("[engine/leads POST]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
