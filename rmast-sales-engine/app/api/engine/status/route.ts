import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeEngine } from "@/lib/engine";
import { getDailyPlan, planDayStart, splitAcross } from "@/lib/daily-plan";

/**
 * Where the engine stands before a run: today's lead target (set by the
 * operator from the dashboard prompt, split evenly across the active
 * campaigns), how many each campaign already got today, and how much
 * pipeline work is waiting. "Today" is the Pakistan day.
 */
export async function GET(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = await getDb();
        const dayStart = planDayStart().toISOString();

        const [plan, campaigns, perCampaignToday, waiting, lastRun] = await Promise.all([
            getDailyPlan(db),
            db
                .collection("campaigns")
                .find({ status: "Active" }, { projection: { name: 1, niche: 1, country: 1, locations: 1 } })
                .sort({ _id: 1 })
                .toArray(),
            db
                .collection("leads")
                .aggregate<{ _id: string; count: number }>([
                    { $match: { discoveredBy: "claude_search", createdAt: { $gte: dayStart } } },
                    { $group: { _id: "$campaignId", count: { $sum: 1 } } },
                ])
                .toArray(),
            db.collection("leads").countDocuments({
                optedOut: { $ne: true },
                activityVerdict: { $ne: "inactive" },
                status: { $nin: ["Won", "Lost"] },
                $or: [{ outreachGeneratedAt: { $exists: false } }, { auditReport: { $exists: false } }],
            }),
            db.collection("engine_runs").find().sort({ ranAt: -1 }).limit(1).next(),
        ]);

        const addedByCampaign = new Map(perCampaignToday.map((row) => [String(row._id), row.count]));
        const split = splitAcross(plan.effectiveTotal, campaigns.length);

        return NextResponse.json({
            today: {
                date: plan.date,
                totalLeads: plan.effectiveTotal,
                setByOperator: plan.todayTotal !== null,
            },
            campaigns: campaigns.map((c, i) => {
                const id = c._id.toString();
                const dailyTarget = split[i];
                const addedToday = addedByCampaign.get(id) || 0;
                return {
                    id,
                    name: c.name,
                    niche: c.niche,
                    country: c.country,
                    locations: c.locations || [],
                    dailyTarget,
                    addedToday,
                    remainingToday: Math.max(0, dailyTarget - addedToday),
                };
            }),
            leadsAddedToday: perCampaignToday.reduce((sum, row) => sum + row.count, 0),
            leadsWaitingForWork: waiting,
            lastRun: lastRun ? { summary: lastRun.summary, ranAt: lastRun.ranAt } : null,
        });
    } catch (error) {
        console.error("[engine/status]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
