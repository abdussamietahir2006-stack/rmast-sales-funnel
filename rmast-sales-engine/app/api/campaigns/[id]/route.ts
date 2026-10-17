import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
        }

        if (!["Active", "Paused"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const db = await getDb();
        const result = await db
            .collection("campaigns")
            .updateOne({ _id: new ObjectId(id) }, { $set: { status } });

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[campaigns/:id PATCH]", error);
        return NextResponse.json(
            { error: "Could not update campaign" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
        }

        const db = await getDb();
        const result = await db
            .collection("campaigns")
            .deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        // Leads discovered by this campaign are kept — deleting a campaign is
        // about stopping discovery, not throwing away pipeline.
        await db
            .collection("leads")
            .updateMany({ campaignId: id }, { $unset: { campaignId: "" } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[campaigns/:id DELETE]", error);
        return NextResponse.json(
            { error: "Could not delete campaign" },
            { status: 500 }
        );
    }
}
