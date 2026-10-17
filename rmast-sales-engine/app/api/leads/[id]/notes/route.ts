import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";

const MAX_NOTE_LENGTH = 5000;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const notes = await db
            .collection("notes")
            .find({ leadId: id })
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json({ notes });
    } catch (error) {
        console.error("[leads/notes GET]", error);
        return NextResponse.json({ error: "Could not load notes" }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
        }

        const body = await request.json();
        const content = String(body.content || "").trim().slice(0, MAX_NOTE_LENGTH);

        if (!content) {
            return NextResponse.json(
                { error: "Note content is required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const note = {
            leadId: id,
            content,
            createdAt: new Date().toISOString(),
        };

        const result = await db.collection("notes").insertOne(note);

        return NextResponse.json({
            success: true,
            note: { ...note, _id: result.insertedId },
        });
    } catch (error) {
        console.error("[leads/notes POST]", error);
        return NextResponse.json({ error: "Could not save note" }, { status: 500 });
    }
}
