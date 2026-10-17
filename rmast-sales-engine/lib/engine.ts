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
    logActivity,
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
// --- Email: replies, conversations, follow-ups, meetings ----------------------
//
// First contact is always the operator's. From then on, email is the engine's:
//   - no reply: a follow-up every FOLLOW_UP_EVERY_DAYS, up to MAX_FOLLOW_UPS,
//     then the lead is retired (deleted, and remembered so it's never re-added)
//   - a reply: the engine answers in the same thread and works toward booking
//     a meeting, which it records once confirmed.
// Every rule that limits sending is enforced here, not in the engine's
// instructions, so no prompt mistake can over-send.

export const FOLLOW_UP_EVERY_DAYS = 3;
export const MAX_FOLLOW_UPS = 4;
/** After the last follow-up, how long to wait for a reply before retiring. */
export const RETIRE_AFTER_DAYS = 3;
/** Gentle nudges allowed in a conversation that went quiet after a reply. */
export const MAX_CONVERSATION_NUDGES = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ThreadMessage {
    direction: "outbound" | "inbound";
    content: string;
    sentAt: string;
    providerMessageId?: string;
    internetMessageId?: string;
    sentiment?: string;
}

function subjectOf(content: string, companyName: string): string {
    const match = content.match(/^\s*subject:\s*(.+?)\r?\n/i);
    return match ? match[1].trim() : `A quick note about ${companyName}`;
}

/** SMTP Message-IDs look like <...@...>; Resend ids and Gmail API ids don't. */
function asMessageId(value?: string): string | undefined {
    return value && /^<.+@.+>$/.test(value) ? value : undefined;
}

/**
 * Every lead that has been emailed, with its whole email thread and the next
 * step the engine may take: a follow-up, a reply in the conversation, or
 * retiring the lead.
 */
export async function getEmailThreads(db: Db) {
    const grouped = await db
        .collection("messages")
        .aggregate<{ _id: string; messages: ThreadMessage[] }>([
            { $match: { channel: "email" } },
            { $sort: { sentAt: 1 } },
            {
                $group: {
                    _id: "$leadId",
                    messages: {
                        $push: {
                            direction: "$direction",
                            content: "$content",
                            sentAt: "$sentAt",
                            providerMessageId: "$providerMessageId",
                            internetMessageId: "$internetMessageId",
                            sentiment: "$sentiment",
                        },
                    },
                },
            },
        ])
        .toArray();

    const leads = await getLeadsByIds(db, grouped.map((t) => t._id));
    const appointments = await db
        .collection("appointments")
        .find({ leadId: { $in: grouped.map((t) => t._id) }, status: "Scheduled" })
        .toArray();
    const meetingByLead = new Map(appointments.map((a) => [String(a.leadId), a.scheduledAt as string]));
    const now = Date.now();

    return grouped
        .map((thread) => {
            const lead = leads.get(thread._id);
            const outbound = thread.messages.filter((m) => m.direction === "outbound");
            if (!lead || outbound.length === 0) return null;

            const inbound = thread.messages.filter((m) => m.direction === "inbound");
            const replied = inbound.length > 0;
            const last = thread.messages[thread.messages.length - 1];
            const daysSinceLastMessage = Math.floor((now - Date.parse(last.sentAt)) / DAY_MS);
            const optedOut = Boolean(lead.optedOut);

            // Before any reply: follow-ups are the outbound emails after the first.
            const followUpsSent = replied ? 0 : outbound.length - 1;
            // After a reply: our messages since their latest reply, unanswered.
            const lastInboundAt = replied ? inbound[inbound.length - 1].sentAt : null;
            const unansweredOurs = replied
                ? outbound.filter((m) => m.sentAt > (lastInboundAt as string)).length
                : 0;
            const meetingAt = meetingByLead.get(thread._id) || null;

            return {
                id: thread._id,
                companyName: lead.companyName,
                ownerName: lead.ownerName || "",
                email: lead.email || "",
                location: lead.location || "",
                status: lead.status,
                optedOut,
                replied,
                meetingBookedFor: meetingAt,
                originalSubject: subjectOf(outbound[0].content, lead.companyName),
                messages: thread.messages.map((m) => ({
                    direction: m.direction,
                    sentAt: m.sentAt,
                    content: m.content,
                    ...(m.sentiment ? { sentiment: m.sentiment } : {}),
                })),
                lastMessageFrom: last.direction === "inbound" ? "lead" : "us",
                daysSinceLastMessage,
                followUpsSent,
                // Their reply is the latest message and nothing has answered it.
                needsReply: replied && !optedOut && last.direction === "inbound",
                followUpDue:
                    !replied &&
                    !optedOut &&
                    followUpsSent < MAX_FOLLOW_UPS &&
                    daysSinceLastMessage >= FOLLOW_UP_EVERY_DAYS,
                // A conversation that went quiet on their side after our answer.
                nudgeDue:
                    replied &&
                    !optedOut &&
                    !meetingAt &&
                    last.direction === "outbound" &&
                    unansweredOurs <= MAX_CONVERSATION_NUDGES &&
                    daysSinceLastMessage >= FOLLOW_UP_EVERY_DAYS,
                retireDue:
                    !replied && followUpsSent >= MAX_FOLLOW_UPS && daysSinceLastMessage >= RETIRE_AFTER_DAYS,
                // The latest Message-ID in the thread, so whatever we send next
                // threads under it in their inbox.
                replyToMessageId:
                    [...thread.messages].reverse().map((m) => asMessageId(m.internetMessageId) || (m.direction === "outbound" ? asMessageId(m.providerMessageId) : undefined)).find(Boolean),
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

async function getThread(db: Db, id: string) {
    return (await getEmailThreads(db)).find((t) => t.id === id);
}

/** A reply found in the operator's inbox. The Gmail message id makes
 *  re-recording a no-op; the RFC Message-ID header lets our answer thread. */
export async function recordReply(
    db: Db,
    id: string,
    reply: {
        content?: unknown;
        receivedAt?: unknown;
        sentiment?: unknown;
        providerMessageId?: unknown;
        internetMessageId?: unknown;
    }
) {
    if (typeof reply.content !== "string" || !reply.content.trim()) {
        return { recorded: false, reason: "content is required" };
    }
    const result = await recordInboundMessage(db, {
        channel: "email",
        leadId: id,
        content: reply.content,
        receivedAt: typeof reply.receivedAt === "string" ? reply.receivedAt : undefined,
        sentiment: typeof reply.sentiment === "string" ? (reply.sentiment as Sentiment) : undefined,
        providerMessageId: typeof reply.providerMessageId === "string" ? reply.providerMessageId : undefined,
    });
    const messageId = typeof reply.internetMessageId === "string" ? asMessageId(reply.internetMessageId.trim()) : undefined;
    if (result.recorded && messageId && typeof reply.providerMessageId === "string") {
        await db
            .collection("messages")
            .updateOne({ providerMessageId: reply.providerMessageId }, { $set: { internetMessageId: messageId } });
    }
    return result;
}

function refusal(thread: Awaited<ReturnType<typeof getThread>>, kind: string): string {
    if (!thread) return "This lead has not been emailed yet.";
    if (thread.optedOut) return "Not sent: the lead has opted out.";
    return `Not sent: no ${kind} is due for this lead right now.`;
}

async function sendInThread(db: Db, id: string, content: string, replyToMessageId?: string) {
    const lead = await getLead(db, id);
    if (!lead) return { ok: false, message: "Lead not found" };
    return sendMessage(db, lead, "email", content, { inReplyTo: replyToMessageId });
}

/** One follow-up to a lead who hasn't replied, only when it's due. */
export async function sendFollowUp(db: Db, id: string, content: unknown) {
    if (typeof content !== "string" || !content.trim()) return { ok: false, message: "content is required" };
    const thread = await getThread(db, id);
    if (!thread?.followUpDue) {
        return {
            ok: false,
            message:
                thread?.replied
                    ? "Not sent: the lead has replied, so answer them with send-reply instead."
                    : thread && thread.followUpsSent >= MAX_FOLLOW_UPS
                        ? "Not sent: all follow-ups are used; retire this lead."
                        : thread && !thread.optedOut
                            ? `Not sent: follow-ups go every ${FOLLOW_UP_EVERY_DAYS} days (it has been ${thread.daysSinceLastMessage}).`
                            : refusal(thread, "follow-up"),
        };
    }
    return sendInThread(db, id, content.trim(), thread.replyToMessageId);
}

/** An answer in an ongoing conversation: when the lead's reply is waiting,
 *  or as a gentle nudge when they've gone quiet after our answer. */
export async function sendConversationReply(db: Db, id: string, content: unknown) {
    if (typeof content !== "string" || !content.trim()) return { ok: false, message: "content is required" };
    const thread = await getThread(db, id);
    if (!thread || !(thread.needsReply || thread.nudgeDue)) return { ok: false, message: refusal(thread, "reply") };
    return sendInThread(db, id, content.trim(), thread.replyToMessageId);
}

/** A meeting the lead booked (seen as a calendar confirmation in the inbox). */
export async function recordMeeting(
    db: Db,
    id: string,
    meeting: { scheduledAt?: unknown; notes?: unknown }
) {
    const when = new Date(String(meeting.scheduledAt || ""));
    if (Number.isNaN(when.getTime())) return { ok: false, message: "A valid scheduledAt (ISO date) is required" };
    const lead = await getLead(db, id);
    if (!lead) return { ok: false, message: "Lead not found" };

    const existing = await db
        .collection("appointments")
        .findOne({ leadId: id, scheduledAt: when.toISOString(), status: "Scheduled" });
    if (existing) return { ok: true, message: "Meeting already recorded." };

    await db.collection("appointments").insertOne({
        leadId: id,
        companyName: lead.companyName,
        scheduledAt: when.toISOString(),
        serviceInterest: typeof meeting.notes === "string" ? meeting.notes.slice(0, 500) : "",
        budget: "",
        timeline: "",
        status: "Scheduled",
        source: "engine",
        createdAt: new Date().toISOString(),
    });
    if (["New", "Analyzing", "Analyzed", "Contacted", "Replied"].includes(lead.status)) {
        await db.collection("leads").updateOne({ _id: lead._id }, { $set: { status: "Qualified" } });
    }
    await logActivity(db, id, "appointment_booked", `Meeting booked for ${when.toISOString()}`);
    return { ok: true, message: `Meeting recorded for ${when.toISOString()}.` };
}

/**
 * Removes a lead that never replied after every follow-up, as the operator
 * asked. Its name and email go on a retired list first, so discovery and
 * imports never add it (and contact it) again.
 */
export async function retireLead(db: Db, id: string) {
    const thread = await getThread(db, id);
    if (!thread?.retireDue) {
        return { ok: false, message: "Not retired: this lead isn't due for removal (it replied, or follow-ups aren't finished)." };
    }
    const lead = await getLead(db, id);
    if (!lead) return { ok: false, message: "Lead not found" };

    await db.collection("retiredLeads").insertOne({
        dedupeKey: lead.dedupeKey || null,
        email: (lead.email || "").toLowerCase() || null,
        website: lead.website || null,
        companyName: lead.companyName,
        reason: `No reply after ${MAX_FOLLOW_UPS} follow-ups`,
        retiredAt: new Date().toISOString(),
    });
    await Promise.all([
        db.collection("messages").deleteMany({ leadId: id }),
        db.collection("activities").deleteMany({ leadId: id }),
        db.collection("notes").deleteMany({ leadId: id }),
        db.collection("leads").deleteOne({ _id: lead._id }),
    ]);
    return { ok: true, message: `${lead.companyName} removed after ${MAX_FOLLOW_UPS} unanswered follow-ups.` };
}
