import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { MAX_DAILY_LEADS, clampDailyLeads, getDailyPlan, setDailyPlan, splitAcross } from "@/lib/daily-plan";

async function planWithSplit() {
    const db = await getDb();
    const [plan, campaigns] = await Promise.all([
        getDailyPlan(db),
        db.collection("campaigns").find({ status: "Active" }, { projection: { name: 1 } }).sort({ _id: 1 }).toArray(),
    ]);
    return { db, plan, campaigns: campaigns.map((c) => ({ id: c._id.toString(), name: c.name as string })) };
}

/** Today's lead target (operator only; proxy.ts gates /api/*). */
export async function GET() {
    try {
        const { plan, campaigns } = await planWithSplit();
        return NextResponse.json({ ...plan, max: MAX_DAILY_LEADS, campaigns });
    } catch (error) {
        console.error("[settings/daily-leads GET]", error);
        return NextResponse.json({ error: "Could not load today's lead target" }, { status: 500 });
    }
}

/** Sets today's lead target: { total }. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const total = clampDailyLeads(body.total);
        if (total === null) {
            return NextResponse.json({ error: `Enter a number from 1 to ${MAX_DAILY_LEADS}.` }, { status: 400 });
        }
        const { db, campaigns } = await planWithSplit();
        await setDailyPlan(db, total);
        const split = splitAcross(total, campaigns.length);
        return NextResponse.json({
            total,
            split: campaigns.map((c, i) => ({ ...c, leads: split[i] })),
        });
    } catch (error) {
        console.error("[settings/daily-leads POST]", error);
        return NextResponse.json({ error: "Could not save today's lead target" }, { status: 500 });
    }
}
