import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function currentMonth() {
    return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export async function GET() {
    try {
        const db = await getDb();
        const goal = await db.collection("goals").findOne({ month: currentMonth() });

        return NextResponse.json({ goal });
    } catch (error) {
        console.error("[goals GET]", error);
        return NextResponse.json({ error: "Could not load goal" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const targetClients = Number(body.targetClients);

        if (!Number.isFinite(targetClients) || targetClients < 0) {
            return NextResponse.json(
                { error: "targetClients must be a non-negative number" },
                { status: 400 }
            );
        }

        const month = currentMonth();
        const db = await getDb();

        await db.collection("goals").updateOne(
            { month },
            {
                $set: {
                    targetClients: Math.round(targetClients),
                    updatedAt: new Date().toISOString(),
                },
                // `createdAt` belongs in $setOnInsert — in $set it was rewritten
                // on every save, so the goal always looked brand new.
                $setOnInsert: { month, createdAt: new Date().toISOString() },
            },
            { upsert: true }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[goals POST]", error);
        return NextResponse.json({ error: "Could not save goal" }, { status: 500 });
    }
}
