import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/pipeline";

/**
 * Public audit report data, addressed by slug.
 *
 * Two things changed here. It no longer returns the lead's `_id` — that was
 * handed to every visitor, who could then call the authenticated lead
 * endpoints with it; booking now goes through `/api/public/audit/[slug]/book`
 * instead. And opening the page no longer flips the lead to "Replied": a link
 * click is not a reply, and corporate mail scanners open links automatically,
 * which filled the pipeline with phantom replies.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const db = await getDb();
        const lead = await db.collection("leads").findOne(
            { auditSlug: slug },
            {
                projection: {
                    companyName: 1,
                    growthScore: 1,
                    scores: 1,
                    problems: 1,
                    recommendations: 1,
                    auditSummary: 1,
                    auditReport: 1,
                    niche: 1,
                    location: 1,
                    demoUrl: 1,
                    optedOut: 1,
                },
            }
        );

        if (!lead) {
            return NextResponse.json({ error: "Audit not found" }, { status: 404 });
        }

        const leadId = lead._id.toString();

        await db
            .collection("leads")
            .updateOne(
                { _id: lead._id },
                { $set: { auditLastViewedAt: new Date().toISOString() }, $inc: { auditViewCount: 1 } }
            );

        await logActivity(db, leadId, "audit_viewed", "Audit page was viewed");

        return NextResponse.json(
            {
                audit: {
                    companyName: lead.companyName,
                    growthScore: lead.growthScore,
                    scores: lead.scores,
                    problems: lead.problems,
                    recommendations: lead.recommendations,
                    auditSummary: lead.auditSummary,
                    auditReport: lead.auditReport,
                    niche: lead.niche,
                    location: lead.location,
                    demoUrl: lead.demoUrl,
                    bookingSlug: slug,
                },
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("[audit/:slug]", error);
        return NextResponse.json({ error: "Could not load audit" }, { status: 500 });
    }
}
