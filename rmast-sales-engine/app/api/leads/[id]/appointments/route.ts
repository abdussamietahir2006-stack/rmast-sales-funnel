import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getLead, logActivity } from "@/lib/pipeline";

/** Statuses a booking is allowed to advance a lead out of. */
const ADVANCEABLE_STATUSES = ["New", "Analyzing", "Analyzed", "Contacted", "Replied"];

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const appointments = await db
            .collection("appointments")
            .find({ leadId: id })
            .sort({ scheduledAt: 1 })
            .toArray();

        return NextResponse.json({ appointments });
    } catch (error) {
        console.error("[leads/appointments GET]", error);
        return NextResponse.json(
            { error: "Could not load appointments" },
            { status: 500 }
        );
    }
}

/** Operator-side booking. The public audit page uses /api/public/audit/[slug]/book. */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { scheduledAt, serviceInterest, budget, timeline } = body;

        const when = new Date(String(scheduledAt || ""));
        if (!scheduledAt || Number.isNaN(when.getTime())) {
            return NextResponse.json(
                { error: "A valid scheduledAt is required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const lead = await getLead(db, id);
        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        const appointment = {
            leadId: id,
            companyName: lead.companyName,
            scheduledAt: when.toISOString(),
            serviceInterest: String(serviceInterest || ""),
            budget: String(budget || ""),
            timeline: String(timeline || ""),
            status: "Scheduled",
            source: "operator",
            createdAt: new Date().toISOString(),
        };

        const result = await db.collection("appointments").insertOne(appointment);

        // Only move the lead forward — booking a call with a Won client must
        // not demote them back to Qualified.
        if (ADVANCEABLE_STATUSES.includes(lead.status)) {
            await db
                .collection("leads")
                .updateOne({ _id: new ObjectId(id) }, { $set: { status: "Qualified" } });
        }

        await logActivity(
            db,
            id,
            "call_booked",
            `Strategy call booked for ${when.toLocaleString()}`
        );

        return NextResponse.json({
            success: true,
            appointment: { ...appointment, _id: result.insertedId },
        });
    } catch (error) {
        console.error("[leads/appointments POST]", error);
        return NextResponse.json(
            { error: "Could not create appointment" },
            { status: 500 }
        );
    }
}
