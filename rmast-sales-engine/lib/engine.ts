import { timingSafeEqual } from "crypto";
import { Db, ObjectId } from "mongodb";
import { fetchBrandAssets } from "@/lib/brand-assets";
import { insertImportedLeads, type ImportedLead } from "@/lib/import-leads";
import { recordInboundMessage, type Sentiment } from "@/lib/inbound";
import { sendMessage } from "@/lib/send";
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
 * identical whichever AI produced the content.
 *
 * First contact is always the operator's: they review each lead and send from
 * its page. After that, email is the engine's job. It records replies it finds
 * in the operator's inbox, and sends follow-ups (sendFollowUp below) to leads
 * who were emailed but haven't replied, within strict limits.
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

// --- Email replies and follow-ups -------------------------------------------

/** Days to wait after the previous email before each follow-up: the first
 *  follow-up 3 days after the opening email, the second 5 days after that.
 *  Its length is the maximum number of follow-ups. */
export const FOLLOW_UP_DELAYS_DAYS = [3, 5];
const DAY_MS = 24 * 60 * 60 * 1000;

function subjectOf(content: string, companyName: string): string {
    const match = content.match(/^\s*subject:\s*(.+?)\r?\n/i);
    return match ? match[1].trim() : `A quick note about ${companyName}`;
}

/**
 * Every lead that has been emailed, with what the engine needs to decide its
 * next step: has it replied, how many follow-ups went out, and is the next
 * follow-up due. Leads that replied or opted out are never due.
 */
export async function getEmailThreads(db: Db) {
    const threads = await db
        .collection("messages")
        .aggregate<{
            _id: string;
            outbound: { content: string; sentAt: string }[];
            inboundCount: number;
            lastInboundAt: string | null;
        }>([
            { $match: { channel: "email" } },
            { $sort: { sentAt: 1 } },
            {
                $group: {
                    _id: "$leadId",
                    outbound: {
                        $push: {
                            $cond: [{ $eq: ["$direction", "outbound"] }, { content: "$content", sentAt: "$sentAt" }, "$$REMOVE"],
                        },
                    },
                    inboundCount: { $sum: { $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0] } },
                    lastInboundAt: { $max: { $cond: [{ $eq: ["$direction", "inbound"] }, "$sentAt", null] } },
                },
            },
            { $match: { "outbound.0": { $exists: true } } },
        ])
        .toArray();

    const leads = await getLeadsByIds(db, threads.map((t) => t._id));
    const now = Date.now();

    return threads
        .map((thread) => {
            const lead = leads.get(thread._id);
            if (!lead) return null;
            const followUpsSent = thread.outbound.length - 1;
            const lastEmailAt = thread.outbound[thread.outbound.length - 1].sentAt;
            const daysSinceLastEmail = Math.floor((now - Date.parse(lastEmailAt)) / DAY_MS);
            const replied = thread.inboundCount > 0;
            const nextDelay = FOLLOW_UP_DELAYS_DAYS[followUpsSent];
            return {
                id: thread._id,
                companyName: lead.companyName,
                ownerName: lead.ownerName || "",
                email: lead.email || "",
                status: lead.status,
                optedOut: Boolean(lead.optedOut),
                replied,
                lastReplyAt: thread.lastInboundAt,
                originalSubject: subjectOf(thread.outbound[0].content, lead.companyName),
                emailsSent: thread.outbound.map((m) => ({ sentAt: m.sentAt, content: m.content })),
                followUpsSent,
                lastEmailAt,
                daysSinceLastEmail,
                followUpDue:
                    !replied && !lead.optedOut && nextDelay !== undefined && daysSinceLastEmail >= nextDelay,
            };
        })
        .filter((t) => t !== null);
}

async function getLeadsByIds(db: Db, ids: string[]) {
    const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const docs = await db
        .collection("leads")
        .find({ _id: { $in: objectIds } }, { projection: { demoHtml: 0 } })
        .toArray();
    return new Map(docs.map((d) => [d._id.toString(), d]));
}

/** A reply the engine found in the operator's inbox. The provider message id
 *  (e.g. Gmail's) makes re-recording the same reply a no-op. */
export async function recordReply(
    db: Db,
    id: string,
    reply: { content?: unknown; receivedAt?: unknown; sentiment?: unknown; providerMessageId?: unknown }
) {
    if (typeof reply.content !== "string" || !reply.content.trim()) {
        return { recorded: false, reason: "content is required" };
    }
    return recordInboundMessage(db, {
        channel: "email",
        leadId: id,
        content: reply.content,
        receivedAt: typeof reply.receivedAt === "string" ? reply.receivedAt : undefined,
        sentiment: typeof reply.sentiment === "string" ? (reply.sentiment as Sentiment) : undefined,
        providerMessageId: typeof reply.providerMessageId === "string" ? reply.providerMessageId : undefined,
    });
}

/**
 * Sends one follow-up email, but only when it is genuinely due: the lead was
 * emailed, hasn't replied or opted out, the wait since the last email has
 * passed, and the follow-up limit isn't reached. These checks live here, not
 * in the engine's instructions, so no prompt mistake can over-send.
 */
export async function sendFollowUp(db: Db, id: string, content: unknown) {
    if (typeof content !== "string" || !content.trim()) {
        return { ok: false, message: "content is required" };
    }
    const thread = (await getEmailThreads(db)).find((t) => t.id === id);
    if (!thread) return { ok: false, message: "This lead has not been emailed yet." };
    if (!thread.followUpDue) {
        return {
            ok: false,
            message: thread.replied
                ? "Not sent: the lead has already replied."
                : thread.optedOut
                    ? "Not sent: the lead has opted out."
                    : thread.followUpsSent >= FOLLOW_UP_DELAYS_DAYS.length
                        ? "Not sent: the follow-up limit is reached."
                        : `Not sent: next follow-up is due ${FOLLOW_UP_DELAYS_DAYS[thread.followUpsSent]} days after the last email (it has been ${thread.daysSinceLastEmail}).`,
        };
    }

    const lead = await getLead(db, id);
    if (!lead) return { ok: false, message: "Lead not found" };

    const result = await sendMessage(db, lead, "email", content.trim());
    if (result.ok) {
        await db.collection("leads").updateOne(
            { _id: lead._id },
            { $set: { lastFollowUpAt: new Date().toISOString() }, $inc: { followUpCount: 1 } }
        );
    }
    return result;
}
