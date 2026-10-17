import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const LIMIT = 500;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const upcomingOnly = searchParams.get("upcoming") === "true";

        const db = await getDb();

        const query = upcomingOnly
            ? { scheduledAt: { $gte: new Date().toISOString() } }
            : {};

        const appointments = await db
            .collection("appointments")
            .find(query)
            .sort({ scheduledAt: 1 })
            .limit(LIMIT)
            .toArray();

        return NextResponse.json({ appointments });
    } catch (error) {
        console.error("[appointments]", error);
        return NextResponse.json(
            { error: "Could not load appointments" },
            { status: 500 }
        );
    }
}
