import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeEngine, logEngineRun } from "@/lib/engine";

/** Records a finished engine run: { summary: "..." }. */
export async function POST(request: Request) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await request.json().catch(() => ({}));
        const summary = typeof body.summary === "string" ? body.summary.slice(0, 4000) : "";
        if (!summary) return NextResponse.json({ error: "summary is required" }, { status: 400 });
        await logEngineRun(await getDb(), summary);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[engine/runs]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
