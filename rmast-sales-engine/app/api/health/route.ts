import { NextResponse } from "next/server";
import clientPromise, { DB_NAME } from "@/lib/db";

export async function GET() {
    try {
        const client = await clientPromise;
        await client.db(DB_NAME).command({ ping: 1 });
        return NextResponse.json(
            { status: "ok", db: "connected" },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("[health]", error);
        // Public endpoint — report the failure without leaking the connection
        // string or internal hostnames that a driver error would include.
        return NextResponse.json(
            { status: "error", db: "unreachable" },
            { status: 503 }
        );
    }
}
