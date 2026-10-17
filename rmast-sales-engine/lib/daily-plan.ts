import { Db } from "mongodb";

/**
 * How many new leads to find each day.
 *
 * The operator sets it from a prompt when they open the dashboard, so the
 * number of first emails can ramp up while the sending address warms up
 * (around 20 a day at first, a little more each day, never above MAX). It is
 * split evenly across the active campaigns. Days are Pakistan days, because
 * that's where the operator works and the nightly run happens.
 */

export const MAX_DAILY_LEADS = 50;
export const DEFAULT_DAILY_LEADS = 20;
const TIME_ZONE = "Asia/Karachi";
const PLAN_COLLECTION = "dailyLeadPlans";

/** Today's date in Pakistan, as YYYY-MM-DD. */
export function planDate(now = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The instant today's Pakistan day began (PKT is UTC+5 all year, no DST). */
export function planDayStart(now = new Date()): Date {
    return new Date(`${planDate(now)}T00:00:00+05:00`);
}

export function clampDailyLeads(value: unknown): number | null {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(n, MAX_DAILY_LEADS);
}

/** Splits a total as evenly as possible; earlier campaigns take any remainder. */
export function splitAcross(total: number, parts: number): number[] {
    if (parts <= 0) return [];
    const base = Math.floor(total / parts);
    return Array.from({ length: parts }, (_, i) => base + (i < total % parts ? 1 : 0));
}

export interface DailyPlanState {
    date: string;
    /** What the operator set for today, or null if they haven't yet. */
    todayTotal: number | null;
    /** The most recent total set on any earlier day. */
    lastTotal: number | null;
    /** What the prompt should offer: one more than last time, capped. */
    suggested: number;
    /** What the nightly run will actually use today. */
    effectiveTotal: number;
}

export async function getDailyPlan(db: Db, now = new Date()): Promise<DailyPlanState> {
    const date = planDate(now);
    const [today, previous] = await Promise.all([
        db.collection(PLAN_COLLECTION).findOne({ date }),
        db.collection(PLAN_COLLECTION).find({ date: { $lt: date } }).sort({ date: -1 }).limit(1).next(),
    ]);
    const todayTotal = today ? Number(today.total) : null;
    const lastTotal = previous ? Number(previous.total) : null;
    return {
        date,
        todayTotal,
        lastTotal,
        suggested: lastTotal ? Math.min(lastTotal + 1, MAX_DAILY_LEADS) : DEFAULT_DAILY_LEADS,
        // Not set today: repeat the last number rather than raising it, so a
        // skipped prompt never pushes past what the operator approved.
        effectiveTotal: todayTotal ?? lastTotal ?? DEFAULT_DAILY_LEADS,
    };
}

export async function setDailyPlan(db: Db, total: number, now = new Date()): Promise<void> {
    const date = planDate(now);
    await db
        .collection(PLAN_COLLECTION)
        .updateOne({ date }, { $set: { date, total, setAt: now.toISOString() } }, { upsert: true });
}
