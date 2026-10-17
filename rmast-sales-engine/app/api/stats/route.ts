import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Aggregate figures for the dashboard overview, which used to render `0` in
 * all four metric cards because it never queried anything.
 */
export async function GET() {
    try {
        const db = await getDb();
        const leads = db.collection("leads");

        const [
            totalLeads,
            outreachSent,
            repliesReceived,
            dealsWon,
            dealsLost,
            appointmentsUpcoming,
            scoreAggregate,
            byStatus,
        ] = await Promise.all([
            leads.countDocuments({}),
            db.collection("messages").countDocuments({ direction: "outbound" }),
            db.collection("messages").countDocuments({ direction: "inbound" }),
            leads.countDocuments({ status: "Won" }),
            leads.countDocuments({ status: "Lost" }),
            db
                .collection("appointments")
                .countDocuments({ scheduledAt: { $gte: new Date().toISOString() } }),
            leads
                .aggregate([
                    { $match: { growthScore: { $type: "number" } } },
                    { $group: { _id: null, average: { $avg: "$growthScore" } } },
                ])
                .toArray(),
            leads
                .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
                .toArray(),
        ]);

        const closed = dealsWon + dealsLost;

        return NextResponse.json(
            {
                stats: {
                    totalLeads,
                    outreachSent,
                    repliesReceived,
                    dealsWon,
                    dealsLost,
                    appointmentsUpcoming,
                    averageGrowthScore: Math.round(scoreAggregate[0]?.average ?? 0),
                    replyRate:
                        outreachSent > 0
                            ? Math.round((repliesReceived / outreachSent) * 100)
                            : 0,
                    winRate: closed > 0 ? Math.round((dealsWon / closed) * 100) : 0,
                    byStatus: Object.fromEntries(
                        byStatus.map((row) => [row._id ?? "Unknown", row.count])
                    ),
                },
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("[stats]", error);
        return NextResponse.json({ error: "Could not load stats" }, { status: 500 });
    }
}
