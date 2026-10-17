import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLead } from "@/lib/pipeline";
import { ALL_CHANNELS, Channel, sendMessage } from "@/lib/send";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const messages = await db
            .collection("messages")
            .find({ leadId: id })
            .sort({ sentAt: 1 })
            .toArray();

        return NextResponse.json({ messages });
    } catch (error) {
        console.error("[leads/messages GET]", error);
        return NextResponse.json(
            { error: "Could not load messages" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const channel = String(body.channel || "") as Channel;
        const content = String(body.content || "").trim();

        if (!ALL_CHANNELS.includes(channel)) {
            return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
        }
        if (!content) {
            return NextResponse.json(
                { error: "Message content is required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const lead = await getLead(db, id);
        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        // An operator hitting this endpoint is itself a deliberate, reviewed
        // send — no separate gate needed here regardless of the auto-send
        // setting, which only governs the scheduled cron run.
        const result = await sendMessage(db, lead, channel, content);

        if (!result.ok) {
            return NextResponse.json(
                { error: result.message },
                { status: result.notConfigured ? 501 : 400 }
            );
        }

        return NextResponse.json({ success: true, message: result.message });
    } catch (error) {
        console.error("[leads/messages POST]", error);
        return NextResponse.json({ error: "Could not send message" }, { status: 500 });
    }
}
