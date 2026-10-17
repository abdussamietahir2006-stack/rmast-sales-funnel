import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeEngine } from "@/lib/engine";

const DEFAULT_DAILY_TARGET = 25;

/**
 * Where the engine stands before a run: which campaigns to find leads for,
 * each one's daily target and how many it already got today (targets are per
 * day, not per run), and how much pipeline work is waiting.
 */
export async function GET(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = await getDb();
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);

        const [campaigns, addedToday, waiting, lastRun] = await Promise.all([
            db
                .collection("campaigns")
                .find({ status: "Active" }, { projection: { name: 1, niche: 1, country: 1, locations: 1, leadCountPerRun: 1 } })
                .toArray(),
            db.collection("leads").countDocuments({
                discoveredBy: "claude_search",
                createdAt: { $gte: startOfDay.toISOString() },
            }),
            db.collection("leads").countDocuments({
                optedOut: { $ne: true },
                activityVerdict: { $ne: "inactive" },
                status: { $nin: ["Won", "Lost"] },
                $or: [{ outreachGeneratedAt: { $exists: false } }, { auditReport: { $exists: false } }],
            }),
            db.collection("engine_runs").find().sort({ ranAt: -1 }).limit(1).next(),
        ]);

        // Each campaign has its own daily target (its leadCountPerRun), so one
        // campaign running dry never eats into another's quota.
        const perCampaignToday = await db
            .collection("leads")
            .aggregate<{ _id: string; count: number }>([
                { $match: { discoveredBy: "claude_search", createdAt: { $gte: startOfDay.toISOString() } } },
                { $group: { _id: "$campaignId", count: { $sum: 1 } } },
            ])
            .toArray();
        const addedByCampaign = new Map(perCampaignToday.map((row) => [String(row._id), row.count]));

        return NextResponse.json({
            campaigns: campaigns.map((c) => {
                const id = c._id.toString();
                const dailyTarget = Number(c.leadCountPerRun) || DEFAULT_DAILY_TARGET;
                const addedTodayForCampaign = addedByCampaign.get(id) || 0;
                return {
                    id,
                    name: c.name,
                    niche: c.niche,
                    country: c.country,
                    locations: c.locations || [],
                    dailyTarget,
                    addedToday: addedTodayForCampaign,
                    remainingToday: Math.max(0, dailyTarget - addedTodayForCampaign),
                };
            }),
            leadsAddedToday: addedToday,
            leadsWaitingForWork: waiting,
            lastRun: lastRun ? { summary: lastRun.summary, ranAt: lastRun.ranAt } : null,
        });
    } catch (error) {
        console.error("[engine/status]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
