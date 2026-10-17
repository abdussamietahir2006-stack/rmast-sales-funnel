import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dedupeKey } from "@/lib/places";

const VALID_STATUSES = [
    "New",
    "Analyzing",
    "Analyzed",
    "Contacted",
    "Replied",
    "Qualified",
    "Won",
    "Lost",
];

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const search = searchParams.get("q");
        const limit = Math.min(
            Number(searchParams.get("limit")) || DEFAULT_LIMIT,
            MAX_LIMIT
        );
        const skip = Math.max(Number(searchParams.get("skip")) || 0, 0);

        const query: Record<string, unknown> = {};
        if (status && VALID_STATUSES.includes(status)) {
            query.status = status;
        }
        if (search) {
            // Escaped so a lead search can't inject a regex that scans forever.
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            query.companyName = { $regex: safe, $options: "i" };
        }

        const db = await getDb();
        const collection = db.collection("leads");

        const [leads, total] = await Promise.all([
            collection
                .find(query, {
                    // `demoHtml` is a full generated landing page — tens of KB
                    // per lead. Nothing in the list views reads it, and
                    // shipping it made every page load scale with the demos.
                    projection: { demoHtml: 0 },
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            collection.countDocuments(query),
        ]);

        return NextResponse.json({ leads, total, limit, skip });
    } catch (error) {
        console.error("[leads GET]", error);
        return NextResponse.json({ error: "Could not load leads" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const companyName = String(body.companyName || "").trim();
        const niche = String(body.niche || "").trim();
        const market = String(body.market || "").trim();
        const location = String(body.location || "").trim();

        // The old handler accepted whatever JSON it was given, so a lead could
        // land in the database with no name and break every page that renders
        // it.
        const missing = Object.entries({ companyName, niche, market, location })
            .filter(([, value]) => !value)
            .map(([field]) => field);

        if (missing.length > 0) {
            return NextResponse.json(
                { error: `Missing required field(s): ${missing.join(", ")}` },
                { status: 400 }
            );
        }

        const website = String(body.website || "").trim();
        if (website && !/^https?:\/\/\S+$/i.test(website)) {
            return NextResponse.json(
                { error: "Website must be a full http(s) URL" },
                { status: 400 }
            );
        }

        const lead = {
            companyName,
            niche,
            market,
            location,
            website,
            phone: String(body.phone || "").trim(),
            email: String(body.email || "").trim().toLowerCase(),
            campaignId: body.campaignId ? String(body.campaignId) : undefined,
            contactSource: "manual",
            dedupeKey: dedupeKey(companyName, market),
            status: "New",
            createdAt: new Date().toISOString(),
        };

        const db = await getDb();
        const result = await db.collection("leads").insertOne(lead);

        return NextResponse.json({ success: true, id: result.insertedId });
    } catch (error) {
        console.error("[leads POST]", error);
        return NextResponse.json({ error: "Could not create lead" }, { status: 500 });
    }
}
