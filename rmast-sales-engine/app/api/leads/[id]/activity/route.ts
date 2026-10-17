import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const LIMIT = 200;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const activities = await db
            .collection("activities")
            .find({ leadId: id })
            .sort({ createdAt: -1 })
            .limit(LIMIT)
            .toArray();

        return NextResponse.json({ activities });
    } catch (error) {
        console.error("[leads/activity]", error);
        return NextResponse.json(
            { error: "Could not load activity" },
            { status: 500 }
        );
    }
}
