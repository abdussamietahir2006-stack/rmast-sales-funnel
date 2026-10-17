import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
    try {
        const db = await getDb();

        const campaigns = await db
            .collection("campaigns")
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        if (campaigns.length === 0) {
            return NextResponse.json({ campaigns: [] });
        }

        // One grouped count instead of a countDocuments per campaign — the old
        // version issued N sequential queries to render one page.
        const counts = await db
            .collection("leads")
            .aggregate([
                {
                    $match: {
                        campaignId: { $in: campaigns.map((c) => c._id.toString()) },
                    },
                },
                { $group: { _id: "$campaignId", count: { $sum: 1 } } },
            ])
            .toArray();

        const countByCampaign = new Map(counts.map((row) => [row._id, row.count]));

        return NextResponse.json({
            campaigns: campaigns.map((campaign) => ({
                ...campaign,
                leadCount: countByCampaign.get(campaign._id.toString()) || 0,
            })),
        });
    } catch (error) {
        console.error("[campaigns GET]", error);
        return NextResponse.json(
            { error: "Could not load campaigns" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const name = String(body.name || "").trim();
        const niche = String(body.niche || "").trim();
        const country = String(body.country || "").trim();

        if (!name || !niche || !country || !body.locations) {
            return NextResponse.json(
                { error: "name, niche, country, and locations are required" },
                { status: 400 }
            );
        }

        const locations = (
            Array.isArray(body.locations)
                ? body.locations
                : String(body.locations).split(",")
        )
            .map((location: unknown) => String(location).trim())
            .filter(Boolean);

        if (locations.length === 0) {
            return NextResponse.json(
                { error: "At least one location is required" },
                { status: 400 }
            );
        }

        const campaign = {
            name,
            niche,
            country,
            locations,
            leadCountPerRun: Math.min(
                Math.max(Number(body.leadCountPerRun) || 100, 1),
                500
            ),
            status: "Active",
            createdAt: new Date().toISOString(),
        };

        const db = await getDb();
        const result = await db.collection("campaigns").insertOne(campaign);

        return NextResponse.json({
            success: true,
            campaign: { ...campaign, _id: result.insertedId },
        });
    } catch (error) {
        console.error("[campaigns POST]", error);
        return NextResponse.json(
            { error: "Could not create campaign" },
            { status: 500 }
        );
    }
}
