import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLead, logActivity } from "@/lib/pipeline";
import { callGeminiJson } from "@/lib/ai";

interface NoteSummary {
    summary: string;
    nextSteps: string;
}

const MAX_NOTE_LENGTH = 20_000;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const notes = await db
            .collection("callNotes")
            .find({ leadId: id })
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json({ notes });
    } catch (error) {
        console.error("[leads/call-notes GET]", error);
        return NextResponse.json(
            { error: "Could not load call notes" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const notes = String(body.notes || "").trim().slice(0, MAX_NOTE_LENGTH);

        if (!notes) {
            return NextResponse.json(
                { error: "Call notes cannot be empty" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const lead = await getLead(db, id);
        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        let summary: string | undefined;
        let nextSteps: string | undefined;

        if (process.env.AI_API_KEY) {
            try {
                const result = await callGeminiJson<NoteSummary>(
                    `
Here are raw notes from a sales call with ${lead.companyName}:
"""
${notes}
"""

Summarize into a structured format. Return JSON exactly:
{ "summary": "2-3 sentence summary of what was discussed", "nextSteps": "1 sentence suggested next action" }
`.trim()
                );
                summary = result.summary;
                nextSteps = result.nextSteps;
            } catch {
                // If AI summarization fails, raw notes are still saved below.
            }
        }

        const callNote = {
            leadId: id,
            companyName: lead.companyName,
            notes,
            summary,
            nextSteps,
            createdAt: new Date().toISOString(),
        };

        const result = await db.collection("callNotes").insertOne(callNote);

        await logActivity(db, id, "call_notes_added", "Call notes were added");

        return NextResponse.json({
            success: true,
            callNote: { ...callNote, _id: result.insertedId },
        });
    } catch (error) {
        console.error("[leads/call-notes POST]", error);
        return NextResponse.json({ error: "Could not save call notes" }, { status: 500 });
    }
}
