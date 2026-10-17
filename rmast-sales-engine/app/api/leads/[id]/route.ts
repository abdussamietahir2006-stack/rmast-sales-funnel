import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/pipeline";

const VALID_STATUSES = [
    "New",
    "Analyzing",
    "Analyzed",
    "Contacted",
    "Replied",
    "Qualified",
    "Won",
    "Lost",
];

/**
 * Every collection that stores rows keyed by `leadId`. Deleting a lead used to
 * miss `notes` and `appointments` entirely, and named `callnotes` in lowercase
 * while the writer used `callNotes` — Mongo collection names are
 * case-sensitive, so those notes survived the delete forever.
 */
const CASCADE_COLLECTIONS = [
    "activities",
    "callNotes",
    "messages",
    "notes",
    "appointments",
];

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
        }

        const db = await getDb();
        const lead = await db
            .collection("leads")
            .findOne({ _id: new ObjectId(id) }, { projection: { demoHtml: 0 } });

        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        return NextResponse.json({ lead });
    } catch (error) {
        console.error("[leads/:id GET]", error);
        return NextResponse.json({ error: "Could not load lead" }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { status, reason } = body;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
        }

        if (!VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const db = await getDb();

        const updateFields: Record<string, unknown> = { status };
        if ((status === "Won" || status === "Lost") && reason) {
            updateFields.winLossReason = String(reason);
        }
        if (status === "Won" || status === "Lost") {
            updateFields.closedAt = new Date().toISOString();
        }

        const result = await db
            .collection("leads")
            .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        await logActivity(
            db,
            id,
            "status_change",
            (status === "Won" || status === "Lost") && reason
                ? `Status changed to ${status} — ${reason}`
                : `Status changed to ${status}`
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[leads/:id PATCH]", error);
        return NextResponse.json({ error: "Could not update lead" }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
        }

        const db = await getDb();

        const result = await db
            .collection("leads")
            .deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        await Promise.all(
            CASCADE_COLLECTIONS.map((name) =>
                db.collection(name).deleteMany({ leadId: id })
            )
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[leads/:id DELETE]", error);
        return NextResponse.json({ error: "Could not delete lead" }, { status: 500 });
    }
}
