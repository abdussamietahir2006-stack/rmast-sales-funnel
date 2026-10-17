import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/pipeline";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid demo ID" }, { status: 400 });
        }

        const db = await getDb();
        const lead = await db
            .collection("leads")
            .findOne(
                { _id: new ObjectId(id) },
                { projection: { demoHtml: 1, companyName: 1 } }
            );

        if (!lead?.demoHtml) {
            return NextResponse.json({ error: "Demo not found" }, { status: 404 });
        }

        await db
            .collection("leads")
            .updateOne(
                { _id: lead._id },
                { $set: { demoLastViewedAt: new Date().toISOString() }, $inc: { demoViewCount: 1 } }
            );

        await logActivity(db, id, "demo_viewed", "Demo page was viewed");

        return NextResponse.json(
            { html: lead.demoHtml, companyName: lead.companyName },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("[demo/:id]", error);
        return NextResponse.json({ error: "Could not load demo" }, { status: 500 });
    }
}
