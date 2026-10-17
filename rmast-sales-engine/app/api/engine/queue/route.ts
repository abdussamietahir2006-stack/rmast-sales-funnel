import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeEngine, getQueue } from "@/lib/engine";

/** Leads with unfinished pipeline work, for Claude to pick up. */
export async function GET(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 10));
        const db = await getDb();
        return NextResponse.json({ queue: await getQueue(db, limit) });
    } catch (error) {
        console.error("[engine/queue]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
