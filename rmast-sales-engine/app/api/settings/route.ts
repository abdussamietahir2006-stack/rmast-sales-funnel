import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const TEXT_FIELDS = [
    "companyName",
    "website",
    "contactEmail",
    "phone",
    "whatsapp",
    "instagram",
    "facebook",
    "linkedin",
] as const;

export async function GET() {
    try {
        const db = await getDb();
        const settings = await db.collection("settings").findOne({});
        return NextResponse.json({ settings });
    } catch (error) {
        console.error("[settings GET]", error);
        return NextResponse.json({ error: "Could not load settings" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const update: Record<string, unknown> = Object.fromEntries(
            TEXT_FIELDS.map((field) => [field, String(body[field] || "").trim()])
        );

        // The master switch for unattended sending. Off means the cron runs the
        // full pipeline but stops before contacting anyone.
        update.autoSendEnabled = body.autoSendEnabled === true;
        update.updatedAt = new Date().toISOString();

        const db = await getDb();
        await db.collection("settings").updateOne({}, { $set: update }, { upsert: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[settings POST]", error);
        return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
    }
}

/**
 * A narrow, single-field update — used by the Auto-Send toggle on the Leads
 * page. POST above replaces every text field with whatever the caller sent,
 * which is fine for the full Settings form but would silently blank out
 * company name, website, etc. if a toggle-only caller used it instead.
 */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();

        const db = await getDb();
        await db.collection("settings").updateOne(
            {},
            {
                $set: {
                    autoSendEnabled: body.autoSendEnabled === true,
                    updatedAt: new Date().toISOString(),
                },
            },
            { upsert: true }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[settings PATCH]", error);
        return NextResponse.json({ error: "Could not update setting" }, { status: 500 });
    }
}
