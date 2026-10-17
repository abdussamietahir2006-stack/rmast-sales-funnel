import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { discoverLeads } from "@/lib/places";

const MAX_PER_REQUEST = 60;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const niche = String(body.niche || "").trim();
        const country = String(body.country || "").trim();
        const state = String(body.state || "").trim();

        if (!niche || !country || !state) {
            return NextResponse.json(
                { error: "Niche, country, and state/location are required" },
                { status: 400 }
            );
        }

        if (!process.env.GOOGLE_PLACES_API_KEY) {
            return NextResponse.json(
                {
                    error:
                        "Google Places API key not configured yet. Add GOOGLE_PLACES_API_KEY to .env.local to enable automatic lead discovery.",
                },
                { status: 501 }
            );
        }

        // Text Search returns at most three pages of 20, so anything above this
        // silently caps anyway — better to be explicit about it.
        const count = Math.min(
            Math.max(Number(body.count) || 20, 1),
            MAX_PER_REQUEST
        );

        const db = await getDb();
        const result = await discoverLeads(db, {
            campaignId: body.campaignId ? String(body.campaignId) : undefined,
            niche,
            country,
            state,
            count,
        });

        return NextResponse.json({
            success: true,
            count: result.inserted,
            skippedDuplicates: result.skippedDuplicates,
            examined: result.examined,
            warning: result.warning,
        });
    } catch (error) {
        console.error("[leads/discover]", error);
        return NextResponse.json(
            { error: `Discovery failed: ${String(error)}` },
            { status: 500 }
        );
    }
}
