import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/pipeline";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const SERVICES = [
    "Website Development",
    "Software Development",
    "Social Media Management",
    "Bookkeeping",
    "Virtual Assistant",
    "Other",
];

/** Statuses a booking is allowed to advance a lead out of. */
const ADVANCEABLE_STATUSES = ["New", "Analyzing", "Analyzed", "Contacted", "Replied"];

const MAX_FIELD_LENGTH = 200;

function clean(value: unknown): string {
    return String(value ?? "").trim().slice(0, MAX_FIELD_LENGTH);
}

/**
 * Booking from the public audit page.
 *
 * This exists so the audit page never needs a lead id. The old flow posted to
 * the authenticated `/api/leads/{id}/appointments` with an id the audit API
 * handed to the browser, which meant that endpoint had to stay public — and
 * anyone could then book against any lead by guessing its id.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const limit = await checkRateLimit({
            scope: "booking",
            key: clientIp(request),
            limit: 5,
            windowSeconds: 60 * 60,
            lockoutSeconds: 60 * 60,
        });

        if (!limit.allowed) {
            return NextResponse.json(
                { error: "Too many booking attempts. Please try again later." },
                { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
            );
        }

        const body = await request.json();
        const scheduledAt = clean(body.scheduledAt);

        const when = new Date(scheduledAt);
        if (!scheduledAt || Number.isNaN(when.getTime())) {
            return NextResponse.json(
                { error: "A valid date and time is required" },
                { status: 400 }
            );
        }

        if (when.getTime() < Date.now() - 60_000) {
            return NextResponse.json(
                { error: "Please choose a time in the future" },
                { status: 400 }
            );
        }

        const serviceInterest = clean(body.serviceInterest);
        if (serviceInterest && !SERVICES.includes(serviceInterest)) {
            return NextResponse.json({ error: "Unknown service" }, { status: 400 });
        }

        const db = await getDb();
        const lead = await db.collection("leads").findOne({ auditSlug: slug });

        if (!lead) {
            return NextResponse.json({ error: "Audit not found" }, { status: 404 });
        }

        const leadId = lead._id.toString();

        await db.collection("appointments").insertOne({
            leadId,
            companyName: lead.companyName,
            scheduledAt: when.toISOString(),
            serviceInterest,
            budget: clean(body.budget),
            timeline: clean(body.timeline),
            status: "Scheduled",
            source: "audit_page",
            createdAt: new Date().toISOString(),
        });

        // Only move the lead forward. Booking a follow-up call for a closed
        // deal must not demote it out of Won or Lost.
        if (ADVANCEABLE_STATUSES.includes(lead.status)) {
            await db
                .collection("leads")
                .updateOne({ _id: lead._id }, { $set: { status: "Qualified" } });
        }

        await logActivity(
            db,
            leadId,
            "call_booked",
            `Strategy call booked for ${when.toISOString()}`
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[public/audit/book]", error);
        return NextResponse.json(
            { error: "Could not complete the booking" },
            { status: 500 }
        );
    }
}
