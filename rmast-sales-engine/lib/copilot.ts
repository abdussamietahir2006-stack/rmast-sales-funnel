import { Db, ObjectId } from "mongodb";
import {
    Lead,
    analyzeLead,
    enrichLead,
    findCompetitorsForLead,
    generateAudit,
    generateDemo,
    generateOutreach,
    getLead,
    logActivity,
    verifyLeadActivity,
} from "@/lib/pipeline";
import { ToolDeclaration } from "@/lib/ai";

/**
 * The Copilot's tool belt.
 *
 * Deliberately excludes anything destructive or unattended-facing: it can
 * never send a real outreach message, delete a lead or campaign, or touch
 * the auto-send setting. Those stay behind their own explicit UI controls —
 * a chat message is not the review step for something a real prospect will
 * receive. Everything here is either read-only, or the exact same pipeline
 * step already available as a button on the lead's own page (see
 * lib/pipeline.ts) — the copilot runs no logic those buttons don't already
 * run.
 */

const VALID_STATUSES = [
    "New",
    "Analyzing",
    "Analyzed",
    "Contacted",
    "Replied",
    "Qualified",
    "Won",
    "Lost",
];

export const COPILOT_TOOLS: ToolDeclaration[] = [
    {
        name: "list_leads",
        description:
            "Search and list leads in the CRM. Use for questions like 'show me leads in X status', 'which leads are in Dubai', or 'leads with a growth score above 70'.",
        parameters: {
            type: "object",
            properties: {
                status: { type: "string", enum: VALID_STATUSES },
                search: { type: "string", description: "Company name contains this text" },
                minGrowthScore: { type: "number" },
                limit: { type: "number", description: "Max results, default 20, max 50" },
            },
        },
    },
    {
        name: "get_lead",
        description:
            "Full detail on one lead: scores, problems, recommendations, competitors, and whether it has an audit, demo, or outreach drafted yet.",
        parameters: {
            type: "object",
            properties: {
                lead: { type: "string", description: "Company name (or lead id)" },
            },
            required: ["lead"],
        },
    },
    {
        name: "get_dashboard_stats",
        description:
            "Aggregate pipeline numbers: total leads, outreach sent, replies received, win rate, average growth score, and counts per pipeline stage.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "list_upcoming_appointments",
        description: "Upcoming booked strategy calls.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "list_campaigns",
        description: "Discovery campaigns and how many leads each has produced.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "verify_activity",
        description:
            "Check whether a business still appears to be actually operating (a Google listing can be stale long after a business closes). Recommended before analyzing a lead you're unsure about.",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "analyze_lead",
        description:
            "Run the AI growth analysis on one lead (scores, problems, recommendations). Required before audit, demo, or outreach can be generated for it.",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "enrich_lead",
        description: "Look up contact info (email, phone, social profiles) for one lead.",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "find_competitors",
        description:
            "Search for real local competitors for one lead. Directional market research, never verified data.",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "generate_audit",
        description: "Generate the public growth-audit report for one lead (needs analysis done first).",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "generate_demo",
        description:
            "Generate the personalized demo landing page for one lead (needs analysis done first). Takes longer than the other steps.",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "generate_outreach",
        description:
            "Draft outreach messages for every channel for one lead. This only drafts — it never sends anything. Sending always requires the operator's own explicit action, either the Send button on the lead's page or the Auto-Send toggle on the Leads page.",
        parameters: {
            type: "object",
            properties: { lead: { type: "string" } },
            required: ["lead"],
        },
    },
    {
        name: "change_lead_status",
        description: "Move a lead to a different pipeline stage.",
        parameters: {
            type: "object",
            properties: {
                lead: { type: "string" },
                status: { type: "string", enum: VALID_STATUSES },
                reason: { type: "string", description: "Used when moving to Won or Lost" },
            },
            required: ["lead", "status"],
        },
    },
];

// --- Lead resolution --------------------------------------------------------

/** Escapes regex special characters so a lead name search can't be abused
 *  into a runaway or malicious pattern. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveLead(db: Db, ref: string): Promise<Lead | { ambiguous: string[] } | null> {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    if (ObjectId.isValid(trimmed)) {
        const byId = await getLead(db, trimmed);
        if (byId) return byId;
    }

    const matches = await db
        .collection("leads")
        .find({ companyName: { $regex: escapeRegex(trimmed), $options: "i" } })
        .limit(5)
        .toArray();

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0] as Lead;
    return { ambiguous: matches.map((m) => m.companyName as string) };
}

interface ToolOutcome {
    result: unknown;
    /** Short, human-readable line shown in the chat's action log. */
    summary: string;
}

function leadNotFound(ref: string): ToolOutcome {
    return {
        result: { error: `No lead found matching "${ref}".` },
        summary: `No lead found matching "${ref}"`,
    };
}

function ambiguousLead(ref: string, names: string[]): ToolOutcome {
    return {
        result: {
            error: `"${ref}" matches more than one lead: ${names.join(", ")}. Ask which one and try again with the exact name.`,
        },
        summary: `"${ref}" is ambiguous (${names.length} matches)`,
    };
}

/** Resolves the `lead` arg for tools that operate on exactly one lead, or
 *  returns a ready-to-use ToolOutcome describing why it couldn't. */
async function resolveOneLead(
    db: Db,
    args: Record<string, unknown>
): Promise<{ lead: Lead } | { outcome: ToolOutcome }> {
    const ref = String(args.lead || "").trim();
    if (!ref) return { outcome: { result: { error: "No lead specified." }, summary: "No lead specified" } };

    const found = await resolveLead(db, ref);
    if (found === null) return { outcome: leadNotFound(ref) };
    if ("ambiguous" in found) return { outcome: ambiguousLead(ref, found.ambiguous) };
    return { lead: found };
}

// --- Tool execution ----------------------------------------------------------

export async function executeCopilotTool(
    db: Db,
    name: string,
    args: Record<string, unknown>
): Promise<ToolOutcome> {
    switch (name) {
        case "list_leads": {
            const query: Record<string, unknown> = {};
            if (typeof args.status === "string" && VALID_STATUSES.includes(args.status)) {
                query.status = args.status;
            }
            if (typeof args.search === "string" && args.search.trim()) {
                query.companyName = { $regex: escapeRegex(args.search.trim()), $options: "i" };
            }
            if (typeof args.minGrowthScore === "number") {
                query.growthScore = { $gte: args.minGrowthScore };
            }
            const limit = Math.min(Number(args.limit) || 20, 50);

            const leads = await db
                .collection("leads")
                .find(query, {
                    projection: {
                        companyName: 1,
                        niche: 1,
                        market: 1,
                        location: 1,
                        status: 1,
                        growthScore: 1,
                    },
                })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();

            return {
                result: { count: leads.length, leads },
                summary: `Listed ${leads.length} lead(s)`,
            };
        }

        case "get_lead": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const l = resolved.lead;
            return {
                result: {
                    id: l._id.toString(),
                    companyName: l.companyName,
                    niche: l.niche,
                    market: l.market,
                    location: l.location,
                    status: l.status,
                    website: l.website || null,
                    email: l.email || null,
                    phone: l.phone || null,
                    growthScore: l.growthScore ?? null,
                    scores: l.scores ?? null,
                    problems: l.problems ?? [],
                    recommendations: l.recommendations ?? [],
                    competitors: l.competitors ?? [],
                    hasAudit: !!l.auditSlug,
                    hasDemo: !!l.demoUrl,
                    hasOutreachDraft: !!l.outreachMessages,
                    activityScore: l.activityScore ?? null,
                    activityVerdict: l.activityVerdict ?? null,
                    optedOut: !!l.optedOut,
                },
                summary: `Looked up ${l.companyName}`,
            };
        }

        case "get_dashboard_stats": {
            const leads = db.collection("leads");
            const [totalLeads, outreachSent, repliesReceived, dealsWon, dealsLost, scoreAgg, byStatus] =
                await Promise.all([
                    leads.countDocuments({}),
                    db.collection("messages").countDocuments({ direction: "outbound" }),
                    db.collection("messages").countDocuments({ direction: "inbound" }),
                    leads.countDocuments({ status: "Won" }),
                    leads.countDocuments({ status: "Lost" }),
                    leads
                        .aggregate([
                            { $match: { growthScore: { $type: "number" } } },
                            { $group: { _id: null, average: { $avg: "$growthScore" } } },
                        ])
                        .toArray(),
                    leads.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
                ]);
            const closed = dealsWon + dealsLost;
            const stats = {
                totalLeads,
                outreachSent,
                repliesReceived,
                dealsWon,
                dealsLost,
                averageGrowthScore: Math.round(scoreAgg[0]?.average ?? 0),
                winRate: closed > 0 ? Math.round((dealsWon / closed) * 100) : 0,
                byStatus: Object.fromEntries(byStatus.map((r) => [r._id ?? "Unknown", r.count])),
            };
            return { result: stats, summary: "Fetched dashboard stats" };
        }

        case "list_upcoming_appointments": {
            const appointments = await db
                .collection("appointments")
                .find({ scheduledAt: { $gte: new Date().toISOString() } })
                .sort({ scheduledAt: 1 })
                .limit(20)
                .toArray();
            return {
                result: { count: appointments.length, appointments },
                summary: `Listed ${appointments.length} upcoming appointment(s)`,
            };
        }

        case "list_campaigns": {
            const campaigns = await db.collection("campaigns").find({}).toArray();
            const counts = await db
                .collection("leads")
                .aggregate([{ $group: { _id: "$campaignId", count: { $sum: 1 } } }])
                .toArray();
            const countByCampaign = new Map(counts.map((r) => [r._id, r.count]));
            const enriched = campaigns.map((c) => ({
                name: c.name,
                niche: c.niche,
                country: c.country,
                status: c.status,
                leadCount: countByCampaign.get(c._id.toString()) || 0,
            }));
            return { result: { campaigns: enriched }, summary: `Listed ${enriched.length} campaign(s)` };
        }

        case "verify_activity": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await verifyLeadActivity(db, resolved.lead);
            return {
                result: step,
                summary: `Activity check for ${resolved.lead.companyName}: ${step.message}`,
            };
        }

        case "analyze_lead": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await analyzeLead(db, resolved.lead);
            return {
                result: step,
                summary: `Analyze ${resolved.lead.companyName}: ${step.ok ? "done" : "failed"} — ${step.message}`,
            };
        }

        case "enrich_lead": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await enrichLead(db, resolved.lead);
            return {
                result: step,
                summary: `Enrich ${resolved.lead.companyName}: ${step.message}`,
            };
        }

        case "find_competitors": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await findCompetitorsForLead(db, resolved.lead);
            return {
                result: step,
                summary: `Competitors for ${resolved.lead.companyName}: ${step.message}`,
            };
        }

        case "generate_audit": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await generateAudit(db, resolved.lead);
            return {
                result: step,
                summary: `Audit for ${resolved.lead.companyName}: ${step.ok ? "generated" : "failed"} — ${step.message}`,
            };
        }

        case "generate_demo": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await generateDemo(db, resolved.lead);
            return {
                result: step,
                summary: `Demo for ${resolved.lead.companyName}: ${step.ok ? "generated" : "failed"} — ${step.message}`,
            };
        }

        case "generate_outreach": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const step = await generateOutreach(db, resolved.lead);
            return {
                result: step,
                summary: `Outreach draft for ${resolved.lead.companyName}: ${step.ok ? "drafted" : "failed"} — ${step.message}`,
            };
        }

        case "change_lead_status": {
            const resolved = await resolveOneLead(db, args);
            if ("outcome" in resolved) return resolved.outcome;
            const status = String(args.status || "");
            if (!VALID_STATUSES.includes(status)) {
                return { result: { error: `Invalid status: ${status}` }, summary: `Invalid status "${status}"` };
            }
            const reason = typeof args.reason === "string" ? args.reason : undefined;
            const update: Record<string, unknown> = { status };
            if ((status === "Won" || status === "Lost") && reason) update.winLossReason = reason;
            if (status === "Won" || status === "Lost") update.closedAt = new Date().toISOString();

            await db.collection("leads").updateOne({ _id: resolved.lead._id }, { $set: update });
            await logActivity(
                db,
                resolved.lead._id.toString(),
                "status_change",
                `Status changed to ${status} by Copilot${reason ? ` — ${reason}` : ""}`
            );
            return {
                result: { ok: true, companyName: resolved.lead.companyName, status },
                summary: `${resolved.lead.companyName} moved to ${status}`,
            };
        }

        default:
            return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool "${name}"` };
    }
}
