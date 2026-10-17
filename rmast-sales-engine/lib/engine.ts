import { timingSafeEqual } from "crypto";
import { Db } from "mongodb";
import { fetchBrandAssets } from "@/lib/brand-assets";
import { insertImportedLeads, type ImportedLead } from "@/lib/import-leads";
import {
    AUDIT_AREAS,
    OUTREACH_CHANNELS,
    applyActivity,
    applyAnalysis,
    applyAudit,
    applyCompetitors,
    applyDemoBrief,
    applyEnrichment,
    applyOutreach,
    checkWebsiteReachable,
    getLead,
    scrapeHomepageSnippet,
    type StepResult,
} from "@/lib/pipeline";

/**
 * The engine API: the same pipeline, with Claude as the AI instead of an API
 * key.
 *
 * A Claude session (run by hand, or daily as a scheduled task; see
 * .claude/skills/run-sales-engine) finds leads with web search and adds them
 * here, pulls each lead's context, does the research and writing itself, and
 * submits the results. Every submission goes through the same apply*()
 * functions the Gemini pipeline uses, so validation, rendering and storage are
 * identical whichever AI produced the content. Nothing here sends a message:
 * the operator reviews each lead and sends from its page.
 */

/** Bearer-token check shared by the engine routes, using CRON_SECRET. */
export function authorizeEngine(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const provided = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const STEPS = ["activity", "analysis", "enrichment", "competitors", "audit", "demo", "outreach"] as const;
type Step = (typeof STEPS)[number];

/** Which steps a lead still needs, judged from what's already stored on it. */
function missingSteps(lead: Record<string, unknown>): Step[] {
    const done: Record<Step, unknown> = {
        activity: lead.activityCheckedAt,
        analysis: lead.analyzedAt,
        enrichment: lead.enrichedAt,
        competitors: lead.competitorsGeneratedAt,
        audit: lead.auditReport,
        demo: lead.demoGeneratedAt,
        outreach: lead.outreachGeneratedAt,
    };
    return STEPS.filter((step) => !done[step]);
}

/** Leads with unfinished pipeline work, oldest first. Skips leads that opted
 *  out, were judged inactive, or are already closed. */
export async function getQueue(db: Db, limit: number) {
    const leads = await db
        .collection("leads")
        .find(
            {
                optedOut: { $ne: true },
                activityVerdict: { $ne: "inactive" },
                status: { $nin: ["Won", "Lost"] },
                $or: [{ outreachGeneratedAt: { $exists: false } }, { auditReport: { $exists: false } }],
            },
            { projection: { demoHtml: 0 } }
        )
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();

    return leads.map((lead) => ({
        id: lead._id.toString(),
        companyName: lead.companyName,
        niche: lead.niche,
        location: lead.location,
        website: lead.website || null,
        missing: missingSteps(lead),
    }));
}

/** Everything Claude needs to work on one lead: what we have stored, plus a
 *  fresh read of their website and their brand assets. */
export async function getContext(db: Db, id: string) {
    const lead = await getLead(db, id);
    if (!lead) return null;

    const [homepageText, reachability, brand] = await Promise.all([
        scrapeHomepageSnippet(lead.website),
        checkWebsiteReachable(lead.website),
        fetchBrandAssets(lead.website),
    ]);

    // Large or internal fields stay out of the context.
    const { demoHtml: _demoHtml, ...stored } = lead;
    void _demoHtml;

    return {
        lead: { ...stored, _id: id },
        missing: missingSteps(lead),
        website: {
            reachable: reachability.reachable,
            note: reachability.note,
            homepageText,
        },
        brand,
        auditAreas: AUDIT_AREAS,
        outreachChannels: OUTREACH_CHANNELS,
    };
}

export interface EngineSubmission {
    activity?: { activityScore: number; signals: string[] };
    analysis?: Parameters<typeof applyAnalysis>[2];
    enrichment?: Parameters<typeof applyEnrichment>[2];
    competitors?: unknown[];
    audit?: Parameters<typeof applyAudit>[2];
    demo?: unknown;
    outreach?: Record<string, unknown>;
}

/**
 * Applies whatever sections Claude submitted, in pipeline order. Each step
 * re-reads the lead because the one before it wrote to it: the audit needs
 * the analysis, and outreach needs the audit and demo links.
 */
export async function submitWork(db: Db, id: string, work: EngineSubmission) {
    const results: Partial<Record<Step, StepResult>> = {};
    const fresh = async () => {
        const lead = await getLead(db, id);
        if (!lead) throw new Error("Lead not found");
        return lead;
    };

    if (work.activity) {
        results.activity = await applyActivity(db, await fresh(), work.activity);
        if (results.activity.data?.verdict === "inactive") {
            // Same rule as the scheduled run: a confidently-closed business
            // gets nothing further spent on it.
            return { results, stoppedReason: "Lead looks inactive; skipped the rest." };
        }
    }
    if (work.analysis) results.analysis = await applyAnalysis(db, await fresh(), work.analysis);
    if (work.enrichment) results.enrichment = await applyEnrichment(db, await fresh(), work.enrichment);
    if (work.competitors) results.competitors = await applyCompetitors(db, await fresh(), work.competitors);

    const needsAnalysis = (step: Step) => ({
        ok: false,
        message: `Skipped ${step}: the lead has no analysis yet. Submit "analysis" first or in the same request.`,
    });

    if (work.audit) {
        const lead = await fresh();
        results.audit = lead.growthScore ? await applyAudit(db, lead, work.audit) : needsAnalysis("audit");
    }
    if (work.demo) {
        const lead = await fresh();
        results.demo = lead.growthScore
            ? await applyDemoBrief(db, lead, work.demo, await fetchBrandAssets(lead.website))
            : needsAnalysis("demo");
    }
    if (work.outreach) {
        const lead = await fresh();
        results.outreach = lead.growthScore ? await applyOutreach(db, lead, work.outreach) : needsAnalysis("outreach");
    }

    return { results, missing: missingSteps(await fresh()) };
}

/** Leads Claude found by web search. Deduplicated against everything already
 *  in the database, exactly like a file import. */
export async function addLeads(db: Db, raw: unknown, campaignId?: string) {
    const rows = Array.isArray(raw) ? raw : [];
    const leads: ImportedLead[] = [];
    let skippedInvalid = 0;

    for (const row of rows) {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
        const companyName = text(r.companyName);
        const market = text(r.market);
        if (!companyName || !market) {
            skippedInvalid++;
            continue;
        }
        leads.push({
            companyName,
            niche: text(r.niche),
            market,
            location: text(r.location) || market,
            website: text(r.website),
            phone: text(r.phone),
            email: text(r.email),
        });
    }

    const outcome = await insertImportedLeads(db, leads, { contactSource: "claude_search", campaignId });
    return { ...outcome, skippedInvalid };
}

/** A record of each engine run, so there is a history of when Claude last
 *  worked through the queue and what it did. */
export async function logEngineRun(db: Db, summary: string) {
    await db.collection("engine_runs").insertOne({ summary, ranAt: new Date().toISOString() });
}
