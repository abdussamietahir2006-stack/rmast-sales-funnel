import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { authorizeEngine, getContext, submitWork, type EngineSubmission } from "@/lib/engine";

type Params = { params: Promise<{ id: string }> };

/** Everything Claude needs to research and write for one lead. */
export async function GET(request: Request, { params }: Params) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });

    try {
        const context = await getContext(await getDb(), id);
        if (!context) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        return NextResponse.json(context);
    } catch (error) {
        console.error("[engine/leads/:id GET]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

/** Claude's finished work for one lead: any subset of the pipeline sections. */
export async function POST(request: Request, { params }: Params) {
    if (!authorizeEngine(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });

    let work: EngineSubmission;
    try {
        work = await request.json();
    } catch {
        return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }

    try {
        return NextResponse.json(await submitWork(await getDb(), id, work));
    } catch (error) {
        console.error("[engine/leads/:id POST]", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
