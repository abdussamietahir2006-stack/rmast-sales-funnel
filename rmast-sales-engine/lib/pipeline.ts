import { Db, ObjectId, WithId, Document } from "mongodb";
import {
    callGemini,
    callGeminiJson,
    callGeminiSearchJson,
    isQuotaError,
} from "@/lib/ai";
import { fetchExternalText } from "@/lib/safe-fetch";
import { publicAppUrl } from "@/lib/app-url";
import { fetchBrandAssets, type BrandAssets } from "@/lib/brand-assets";
import { normalizeDemoSiteBrief, renderDemoSite, type DemoSiteBrief } from "@/lib/demo-site";
import type { AuditArea, AuditReport } from "@/models/lead";

/**
 * The lead pipeline, as plain functions.
 *
 * These used to live only inside route handlers, so the cron drove them by
 * fetching its own API six times per lead — sixty chained serverless
 * invocations in a single request, each paying a cold start and re-opening a
 * database connection. The route handlers are now thin wrappers around these,
 * and the cron calls them directly.
 */

export interface StepResult {
    ok: boolean;
    /** Human-readable outcome, used in the cron log and lead activity feed. */
    message: string;
    /** True when the step failed because Gemini quota ran out. */
    quotaExhausted?: boolean;
    data?: Record<string, unknown>;
}

export type Lead = WithId<Document>;

export async function logActivity(
    db: Db,
    leadId: string,
    type: string,
    description: string
): Promise<void> {
    await db.collection("activities").insertOne({
        leadId,
        type,
        description,
        createdAt: new Date().toISOString(),
    });
}

export async function getLead(db: Db, id: string): Promise<Lead | null> {
    if (!ObjectId.isValid(id)) return null;
    return db.collection("leads").findOne({ _id: new ObjectId(id) });
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

async function updateLead(
    db: Db,
    id: string,
    fields: Record<string, unknown>
): Promise<void> {
    await db
        .collection("leads")
        .updateOne({ _id: new ObjectId(id) }, { $set: fields });
}

function aiUnavailable(step: string): StepResult {
    return {
        ok: false,
        message: `AI API key not configured yet. Add AI_API_KEY to .env.local to enable ${step}.`,
    };
}

// --- Activity Verification --------------------------------------------------
//
// A Google Places listing has no reason to correct itself once nobody's
// looking at it — a business from 1990 that closed in 2010 can still show up
// as "operational" today. Discovery already filters to Places' own
// `businessStatus === "OPERATIONAL"`, but that field can simply be stale, so
// this runs before analysis, audit, demo and outreach — the goal is to catch
// a dead lead before spending any of that effort on it, not after.
//
// Deliberately fails open: an inconclusive check (quota, a search error)
// never blocks a lead — only an explicit "inactive" verdict does. Losing a
// real lead to a technical hiccup would defeat the point.

export interface ActivityCheckResult {
    activityScore: number;
    signals: string[];
    verdict: "active" | "review" | "inactive";
}

/** Below this, a lead is flagged inactive and skipped by the scheduled run
 *  (though never blocked from a manual, operator-triggered action). */
const INACTIVE_THRESHOLD = 30;
/** Below this (and at/above INACTIVE_THRESHOLD), flagged "review" — shown to
 *  the operator, but still allowed to proceed through the funnel normally. */
const REVIEW_THRESHOLD = 60;

export async function checkWebsiteReachable(website?: string): Promise<{ reachable: boolean; note: string }> {
    if (!website) return { reachable: false, note: "No website listed" };
    try {
        const html = await fetchExternalText(website);
        if (!html) return { reachable: false, note: "Website did not respond" };

        const lower = html.toLowerCase();
        const parkedSignals = [
            "domain is for sale",
            "buy this domain",
            "this domain may be for sale",
            "the domain has expired",
            "future home of something quite cool",
            "account has been suspended",
        ];
        if (parkedSignals.some((s) => lower.includes(s))) {
            return { reachable: false, note: "Website looks like a parked or expired domain page" };
        }
        return { reachable: true, note: "Website responded normally" };
    } catch {
        return { reachable: false, note: "Website could not be reached" };
    }
}

export async function verifyLeadActivity(db: Db, lead: Lead): Promise<StepResult> {
    const id = lead._id.toString();

    // A Places-sourced lead already known closed needs no further spend —
    // free, certain, and doesn't touch Gemini at all.
    if (lead.businessStatus === "CLOSED_PERMANENTLY" || lead.businessStatus === "CLOSED_TEMPORARILY") {
        const result: ActivityCheckResult = {
            activityScore: 0,
            signals: [`Google Places lists this business as ${lead.businessStatus}`],
            verdict: "inactive",
        };
        await updateLead(db, id, {
            activityScore: result.activityScore,
            activitySignals: result.signals,
            activityVerdict: result.verdict,
            activityCheckedAt: new Date().toISOString(),
        });
        await logActivity(db, id, "activity_checked", `Marked inactive — ${result.signals[0]}`);
        return { ok: true, message: result.signals[0], data: { ...result } };
    }

    if (!process.env.AI_API_KEY) return aiUnavailable("activity verification");

    const website = await checkWebsiteReachable(lead.website);

    const prompt = `
Search for current, public evidence about whether this specific business is
still actively operating TODAY — not whether it existed at some point.

Business: ${lead.companyName}
Niche: ${lead.niche}
Location: ${lead.location}, ${lead.market}
Website: ${lead.website || "none listed"} — ${website.note}
Google Places status: ${lead.businessStatus || "unknown"}

Look for recent evidence: recent reviews or review activity, recent social
media posts or updates, current news or listing mentions, or explicit signs
of closure ("permanently closed", "out of business", "for lease" at that
address, no activity in years). An old listing existing online is NOT
evidence of current activity — weight recent evidence over old, and say so
plainly if you can't find anything conclusive either way.

Return JSON exactly:
{ "activityScore": number from 0 (clearly no longer operating) to 100 (clearly active today),
  "signals": ["short evidence point", "..."],
  "verdict": "active" | "review" | "inactive" }
`.trim();

    let raw: Partial<ActivityCheckResult>;
    try {
        raw = await callGeminiSearchJson<Partial<ActivityCheckResult>>(prompt);
    } catch (error) {
        return {
            ok: false,
            message: `Activity check inconclusive: ${String(error)}`,
            quotaExhausted: isQuotaError(error),
        };
    }

    return applyActivity(db, lead, raw, website.note);
}

/** Saves an activity verdict, whoever produced it: Gemini above, or Claude
 *  through the engine API (lib/engine.ts). */
export async function applyActivity(
    db: Db,
    lead: Lead,
    raw: Partial<ActivityCheckResult>,
    fallbackSignal = "No evidence recorded"
): Promise<StepResult> {
    const id = lead._id.toString();
    const activityScore = Math.max(0, Math.min(100, Math.round(Number(raw.activityScore) || 0)));
    // Derived from the score rather than trusted verbatim from the model,
    // so the active/review/inactive line is one consistent, tunable rule
    // rather than whatever label the model felt like using this time.
    const verdict: ActivityCheckResult["verdict"] =
        activityScore < INACTIVE_THRESHOLD
            ? "inactive"
            : activityScore < REVIEW_THRESHOLD
                ? "review"
                : "active";
    const result: ActivityCheckResult = {
        activityScore,
        signals:
            Array.isArray(raw.signals) && raw.signals.length > 0
                ? raw.signals.slice(0, 6).map((s) => String(s))
                : [fallbackSignal],
        verdict,
    };

    await updateLead(db, id, {
        activityScore: result.activityScore,
        activitySignals: result.signals,
        activityVerdict: result.verdict,
        activityCheckedAt: new Date().toISOString(),
    });

    await logActivity(
        db,
        id,
        "activity_checked",
        `Activity score ${result.activityScore}/100 (${result.verdict})${result.signals[0] ? ` — ${result.signals[0]}` : ""}`
    );

    return {
        ok: true,
        message: `Activity score ${result.activityScore}/100 — ${result.verdict}`,
        data: { ...result },
    };
}

// --- Analyze --------------------------------------------------------------

export interface AnalysisResult {
    scores: {
        website: number;
        social: number;
        leadGeneration: number;
        conversion: number;
        seo: number;
        branding: number;
    };
    problems: string[];
    recommendations: string[];
}

const SCORE_KEYS = [
    "website",
    "social",
    "leadGeneration",
    "conversion",
    "seo",
    "branding",
] as const;

/** Clamps a model-supplied score into 0-100, so one bad value can't skew the average. */
function normalizeScore(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
}

export async function analyzeLead(db: Db, lead: Lead): Promise<StepResult> {
    const id = lead._id.toString();

    if (!process.env.AI_API_KEY) return aiUnavailable("analysis");

    await updateLead(db, id, { status: "Analyzing" });

    const prompt = `
You are analyzing a business for a growth agency called RMAST STUDIO.

Business: ${lead.companyName}
Niche: ${lead.niche}
Location: ${lead.location}, ${lead.market}
Website: ${lead.website || "none found"}

Based on this business's niche and the fact that they ${lead.website ? "have a website" : "have no listed website"
        }, provide a realistic growth analysis. Score each category 0-100.
Be specific to a business of this type and location, not generic.

Recommendations must ONLY suggest services RMAST STUDIO actually offers:
Website Development, Software Development, Social Media Management,
Bookkeeping, or Virtual Assistant services. Do not suggest anything
outside this list.

Return JSON in this exact shape:
{
  "scores": {
    "website": number,
    "social": number,
    "leadGeneration": number,
    "conversion": number,
    "seo": number,
    "branding": number
  },
  "problems": ["specific problem 1", "specific problem 2", "specific problem 3"],
  "recommendations": ["specific fix 1", "specific fix 2", "specific fix 3"]
}
`.trim();

    let result: AnalysisResult;
    try {
        result = await callGeminiJson<AnalysisResult>(prompt);
    } catch (error) {
        // Roll the status back so the lead is picked up again on the next run
        // instead of being stranded in "Analyzing" forever.
        await updateLead(db, id, { status: "New" });
        return {
            ok: false,
            message: isQuotaError(error)
                ? "Analysis skipped: Gemini quota reached. Try again later."
                : "AI analysis failed to return valid data. Try again.",
            quotaExhausted: isQuotaError(error),
        };
    }

    return applyAnalysis(db, lead, result);
}

export async function applyAnalysis(
    db: Db,
    lead: Lead,
    result: Partial<AnalysisResult>
): Promise<StepResult> {
    const id = lead._id.toString();
    const scores = Object.fromEntries(
        SCORE_KEYS.map((key) => [key, normalizeScore(result.scores?.[key])])
    ) as AnalysisResult["scores"];

    const growthScore = Math.round(
        SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0) / SCORE_KEYS.length
    );

    await updateLead(db, id, {
        status: "Analyzed",
        scores,
        growthScore,
        problems: Array.isArray(result.problems) ? result.problems : [],
        recommendations: Array.isArray(result.recommendations)
            ? result.recommendations
            : [],
        analyzedAt: new Date().toISOString(),
    });

    await logActivity(db, id, "analyzed", "Lead was analyzed");

    return { ok: true, message: "Analysis complete.", data: { growthScore } };
}

// --- Enrich ---------------------------------------------------------------

interface ScrapedContact {
    email?: string;
    ownerName?: string;
}

interface SocialProfiles {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
}

async function scrapeWebsiteContact(website: string): Promise<ScrapedContact> {
    try {
        const html = await fetchExternalText(website);
        if (!html) return {};

        const text = html.replace(/<[^>]+>/g, " ").slice(0, 8000);

        const prompt = `
Here is raw text extracted from a business's website homepage:
"""
${text}
"""

Extract, if present: a contact email address, and an owner/manager's name
(only if clearly stated, e.g. "Founded by..." or "Contact John at..").
Return JSON exactly: { "email": "found email or empty string", "ownerName": "found name or empty string" }
`.trim();

        return await callGeminiJson<ScrapedContact>(prompt);
    } catch {
        return {};
    }
}

async function findSocialProfiles(
    companyName: string,
    location: string
): Promise<SocialProfiles> {
    try {
        const prompt = `
Search for the real, public Instagram, Facebook, and LinkedIn profile
pages for this specific business: "${companyName}" located in ${location}.

Only return a URL if you find a genuine, specific match for THIS exact
business — do not guess or invent a URL, and do not return a generic
search results page. If you cannot confirm a real profile for a platform,
leave that field as an empty string.

Return JSON exactly:
{ "instagram": "full URL or empty string", "facebook": "full URL or empty string", "linkedin": "full URL or empty string" }
`.trim();

        return await callGeminiSearchJson<SocialProfiles>(prompt);
    } catch {
        return {};
    }
}

export async function enrichLead(db: Db, lead: Lead): Promise<StepResult> {
    const found: EnrichmentFindings = {};

    if (!lead.email && lead.website && process.env.AI_API_KEY) {
        const scraped = await scrapeWebsiteContact(lead.website);
        found.email = scraped.email;
        found.ownerName = scraped.ownerName;
    }

    if (!lead.email && lead.website && process.env.ENRICHMENT_API_KEY) {
        // --- Hunter.io / Apollo.io lookup goes here once that key is added ---
    }

    const hasDirectContact = !!(lead.email || found.email) || !!lead.phone;
    if (!hasDirectContact && process.env.AI_API_KEY) {
        Object.assign(found, await findSocialProfiles(lead.companyName, lead.location));
    }

    return applyEnrichment(db, lead, found);
}

export interface EnrichmentFindings {
    email?: string;
    ownerName?: string;
    ownerTitle?: string;
    ownerLinkedin?: string;
    licenseInfo?: string;
    phone?: string;
    /** A mobile number the business or owner uses on WhatsApp, when found. */
    whatsapp?: string;
    instagram?: string;
    facebook?: string;
    linkedin?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only a real-looking profile URL on the platform's own domain gets stored;
 *  anything else (a search page, a guess) is dropped. */
function cleanProfileUrl(value: unknown, domain: string): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    try {
        const url = new URL(value.trim());
        return url.hostname.replace(/^www\./, "").endsWith(domain) ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

/** Merges newly found contact details into the lead, never overwriting ones it
 *  already has, then works out how the lead can be reached. */
export async function applyEnrichment(
    db: Db,
    lead: Lead,
    found: EnrichmentFindings
): Promise<StepResult> {
    const id = lead._id.toString();

    const foundEmail = typeof found.email === "string" && EMAIL_RE.test(found.email.trim()) ? found.email.trim() : "";
    const email: string = lead.email || foundEmail;
    const ownerName: string = lead.ownerName || (typeof found.ownerName === "string" ? found.ownerName.trim() : "");
    const phone: string = lead.phone || (typeof found.phone === "string" ? found.phone.trim() : "");
    const whatsapp: string = lead.whatsapp || (typeof found.whatsapp === "string" ? found.whatsapp.trim().slice(0, 40) : "");
    const contactSource: string =
        lead.email ? lead.contactSource || "google_places" : foundEmail ? "website" : lead.contactSource || "google_places";

    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const ownerTitle: string = lead.ownerTitle || text(found.ownerTitle, 120);
    // Must be a personal profile (/in/), not a company page or search result.
    const foundOwnerLinkedin = cleanProfileUrl(found.ownerLinkedin, "linkedin.com");
    const ownerLinkedin: string =
        lead.ownerLinkedin || (foundOwnerLinkedin && /linkedin\.com\/in\//i.test(foundOwnerLinkedin) ? foundOwnerLinkedin : "");
    // License status can change, so a fresh finding replaces the old one.
    const licenseInfo: string = text(found.licenseInfo, 200) || lead.licenseInfo || "";

    const instagram = lead.instagram || cleanProfileUrl(found.instagram, "instagram.com") || "";
    const facebook = lead.facebook || cleanProfileUrl(found.facebook, "facebook.com") || "";
    const linkedin = lead.linkedin || cleanProfileUrl(found.linkedin, "linkedin.com") || "";

    const hasDirectContact = !!email || !!phone;
    const hasSocial = !!instagram || !!facebook || !!linkedin;
    const contactMethod: "direct" | "social_manual" | "unreachable" = hasDirectContact
        ? "direct"
        : hasSocial
            ? "social_manual"
            : "unreachable";

    await updateLead(db, id, {
        email,
        ownerName,
        ownerTitle,
        whatsapp,
        ownerLinkedin,
        licenseInfo,
        phone,
        contactSource,
        instagram,
        facebook,
        linkedin,
        contactMethod,
        enrichedAt: new Date().toISOString(),
    });

    const statusMessage =
        contactMethod === "direct"
            ? `Enrichment complete (source: ${contactSource})`
            : contactMethod === "social_manual"
                ? "No email/phone found — real social profiles found via search for manual outreach"
                : "No email, phone, or social profiles found — flagged as unreachable";

    await logActivity(db, id, "enriched", statusMessage);

    return {
        ok: true,
        message: statusMessage,
        data: {
            contactMethod,
            email: email || null,
            phone: phone || null,
            instagram: instagram || null,
            facebook: facebook || null,
            linkedin: linkedin || null,
        },
    };
}

// --- Competitors ----------------------------------------------------------
//
// This is directional market research for one specific lead — grounded
// search results, never verified data — and it must stay scoped to that
// lead: stored only on its own `competitors` array, never surfaced as a
// cross-lead directory, and never carrying contact details we didn't ask for
// and can't verify.

interface RawCompetitor {
    name?: unknown;
    website?: unknown;
    strength?: unknown;
    // Anything else the model attaches (a phone number, an email, a
    // "WhatsApp") is discarded by sanitizeCompetitors below rather than
    // trusted through to storage.
    [key: string]: unknown;
}

interface CompetitorResult {
    competitors: RawCompetitor[];
}

const MAX_COMPETITORS = 4;

/** Keeps only the three fields ever requested, regardless of what the model
 *  actually returned — the one place this data is trusted into the database. */
function sanitizeCompetitors(
    raw: RawCompetitor[]
): { name: string; website: string; strength: string }[] {
    return raw
        .map((c) => ({
            name: String(c?.name ?? "").trim().slice(0, 200),
            website: String(c?.website ?? "").trim().slice(0, 300),
            strength: String(c?.strength ?? "").trim().slice(0, 500),
        }))
        .filter((c) => c.name.length > 0)
        .slice(0, MAX_COMPETITORS);
}

export async function findCompetitorsForLead(
    db: Db,
    lead: Lead
): Promise<StepResult> {

    if (!lead.growthScore) {
        return { ok: false, message: "Analyze this lead before finding competitors." };
    }
    if (!process.env.AI_API_KEY) return aiUnavailable("competitor analysis");

    const prompt = `
Search for up to 2 real, actual, named ${lead.niche} businesses operating in
or very near ${lead.location}, ${lead.market}, that would be realistic local
competitors to "${lead.companyName}".

For each one you find, briefly note ONE specific advantage they likely
have based on what's publicly visible about them (e.g. their website,
reviews, or online presence), relevant to these problems the target
business has: ${(lead.problems || []).join("; ") || "none recorded"}

Only include a business if you can find real evidence it exists near
this location — do not invent names or websites.

This is directional market research only, never verified contact data. Do
NOT include a phone number, email address, WhatsApp number, or any other
contact detail for any competitor, even if you happen to find one — return
only the three fields below and nothing else.

Return JSON exactly:
{ "competitors": [{ "name": "real business name", "website": "their real website URL if found, else empty string", "strength": "specific advantage" }] }
`.trim();

    let competitors: { name: string; website: string; strength: string }[] = [];
    let skippedReason = "";
    let quotaExhausted = false;

    try {
        const result = await callGeminiSearchJson<CompetitorResult>(prompt);
        competitors = sanitizeCompetitors(Array.isArray(result.competitors) ? result.competitors : []);
    } catch (error) {
        quotaExhausted = isQuotaError(error);
        skippedReason = quotaExhausted
            ? "Competitor search skipped: Gemini's free-tier search quota was reached. Enable billing on your API key to remove this limit, or try again later."
            : `Competitor search skipped due to an error: ${String(error)}`;
    }

    return applyCompetitors(db, lead, competitors, skippedReason, quotaExhausted);
}

export async function applyCompetitors(
    db: Db,
    lead: Lead,
    raw: unknown,
    skippedReason = "",
    quotaExhausted = false
): Promise<StepResult> {
    const id = lead._id.toString();
    const competitors = sanitizeCompetitors(Array.isArray(raw) ? (raw as RawCompetitor[]) : []);

    await updateLead(db, id, {
        competitors,
        competitorsGeneratedAt: new Date().toISOString(),
    });

    await logActivity(
        db,
        id,
        "competitors_found",
        skippedReason || `Found ${competitors.length} real local competitors via search`
    );

    // Competitors are a nice-to-have enrichment, not a gate: a skipped search
    // must not stop the audit and outreach that follow.
    return {
        ok: true,
        message: skippedReason || `Found ${competitors.length} competitors.`,
        quotaExhausted,
        data: { competitors, warning: skippedReason || undefined },
    };
}

// --- Audit ----------------------------------------------------------------
//
// A whole-business audit, not just a digital-presence score: eight fixed
// areas, so every report covers the same ground and none can be silently
// skipped. The model only sees what we actually know (analysis, enrichment,
// competitors, activity signals and a scrape of their homepage), and is told
// to report missing data as a finding rather than invent details.

export const AUDIT_AREAS = [
    "Website & User Experience",
    "Search & Local Visibility",
    "Social Media & Content",
    "Brand & Messaging",
    "Lead Generation & Sales Process",
    "Customer Experience & Reputation",
    "Operations & Admin",
    "Competitive Position",
] as const;

const AUDIT_STATUSES = ["strong", "needs work", "critical"] as const;

function cleanStrings(value: unknown, max: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
        .slice(0, max);
}

function statusForScore(score: number): AuditArea["status"] {
    if (score >= 70) return "strong";
    if (score >= 40) return "needs work";
    return "critical";
}

/** Fills in or drops anything malformed, so a partial model response still
 *  renders as a coherent report instead of crashing the public audit page. */
function normalizeAuditReport(raw: Partial<AuditReport> | null | undefined, lead: Lead): AuditReport {
    const rawAreas = raw && Array.isArray(raw.areas) ? raw.areas : [];
    const areas: AuditArea[] = rawAreas
        .filter((a) => a && typeof a.area === "string" && a.area.trim())
        .slice(0, AUDIT_AREAS.length)
        .map((a) => {
            const score = normalizeScore(a.score);
            return {
                area: a.area.trim(),
                score,
                status: AUDIT_STATUSES.includes(a.status as AuditArea["status"])
                    ? (a.status as AuditArea["status"])
                    : statusForScore(score),
                findings: cleanStrings(a.findings, 4),
                recommendations: cleanStrings(a.recommendations, 3),
            };
        });

    const rawSnapshot = (raw?.snapshot || {}) as Partial<AuditReport["snapshot"]>;
    const rawPlan = raw && Array.isArray(raw.actionPlan) ? raw.actionPlan : [];

    return {
        executiveSummary:
            (typeof raw?.executiveSummary === "string" && raw.executiveSummary.trim()) ||
            `${lead.companyName} has clear room to grow across several parts of the business.`,
        snapshot: {
            whatTheyDo: (typeof rawSnapshot.whatTheyDo === "string" && rawSnapshot.whatTheyDo.trim()) || "",
            targetCustomers:
                (typeof rawSnapshot.targetCustomers === "string" && rawSnapshot.targetCustomers.trim()) || "",
            onlinePresence:
                (typeof rawSnapshot.onlinePresence === "string" && rawSnapshot.onlinePresence.trim()) || "",
        },
        areas,
        strengths: cleanStrings(raw?.strengths, 4),
        quickWins: cleanStrings(raw?.quickWins, 5),
        actionPlan: rawPlan
            .filter((p) => p && typeof p.phase === "string")
            .slice(0, 3)
            .map((p) => ({ phase: p.phase.trim(), items: cleanStrings(p.items, 4) }))
            .filter((p) => p.items.length > 0),
        howWeHelp: (raw && Array.isArray(raw.howWeHelp) ? raw.howWeHelp : [])
            .filter((h) => h && typeof h.service === "string" && typeof h.outcome === "string")
            .slice(0, 5)
            .map((h) => ({ service: h.service.trim(), outcome: h.outcome.trim() })),
    };
}

export async function generateAudit(db: Db, lead: Lead): Promise<StepResult> {

    if (!lead.growthScore) {
        return { ok: false, message: "Analyze this lead before generating an audit." };
    }
    if (!process.env.AI_API_KEY) return aiUnavailable("audit generation");

    const competitors = (lead.competitors || []) as { name: string; strength: string }[];
    const homepageSnippet = await scrapeHomepageSnippet(lead.website);
    const socials = (["instagram", "facebook", "linkedin"] as const)
        .map((key) => `${key}: ${lead[key] || "not found"}`)
        .join(", ");

    const prompt = `
You are a senior business consultant at RMAST STUDIO writing a complete
business audit for the owner of ONE specific business. Cover the whole
business, not just its website.

Business: ${lead.companyName}
Niche: ${lead.niche}
Location: ${lead.location}, ${lead.market}
Website: ${lead.website || "none found"}
Public contact details found: email ${lead.email || "none"}, phone ${lead.phone || "none"}
Social profiles found: ${socials}
${homepageSnippet
            ? `Text scraped from their homepage (the only first-hand view of the business you have):\n"""\n${homepageSnippet}\n"""\n`
            : "We could not read a homepage for this business.\n"
        }
Earlier analysis — growth score ${lead.growthScore}/100, breakdown ${JSON.stringify(lead.scores || {})}
Problems noted: ${(lead.problems || []).join("; ") || "none recorded"}
${competitors.length > 0
            ? `Local competitors (you may reference them by name in the Competitive Position area):\n${competitors
                .map((c) => `- ${c.name}: ${c.strength}`)
                .join("\n")}\n`
            : "No competitor research is available.\n"
        }${Array.isArray(lead.activitySignals) && lead.activitySignals.length > 0
            ? `Activity signals: ${lead.activitySignals.join("; ")}\n`
            : ""
        }
Audit exactly these ${AUDIT_AREAS.length} areas, in this order:
${AUDIT_AREAS.map((a, i) => `${i + 1}. ${a}`).join("\n")}

For each area give a 0-100 score (consistent with the earlier breakdown where
they overlap), a status ("strong", "needs work" or "critical"), 2-4 specific
findings and 2-3 practical recommendations.

Rules:
- Only state facts supported by the data above. Where data is missing, say so
  as a finding (e.g. "We couldn't find an Instagram profile for you") rather
  than inventing reviews, numbers, staff, prices or opening hours.
- Write to the owner as "you". Be direct and honest, but constructive.
- Recommendations may cover anything that would genuinely help the business.
- "howWeHelp" may ONLY use these RMAST STUDIO services: Website Development,
  Software Development, Social Media Management, Bookkeeping, Virtual
  Assistant. Include only the ones that address findings in this audit.
- Plain text in every field, no markdown.

Return JSON exactly:
{
  "executiveSummary": "3-4 sentences: where the business stands and the biggest opportunity",
  "snapshot": { "whatTheyDo": "1 sentence", "targetCustomers": "1 sentence", "onlinePresence": "1 sentence" },
  "areas": [{ "area": "name from the list", "score": number, "status": "strong|needs work|critical", "findings": ["..."], "recommendations": ["..."] }],
  "strengths": ["2-4 things the business already does well"],
  "quickWins": ["3-5 changes doable within a week"],
  "actionPlan": [
    { "phase": "First 30 days", "items": ["..."] },
    { "phase": "Days 31-60", "items": ["..."] },
    { "phase": "Days 61-90", "items": ["..."] }
  ],
  "howWeHelp": [{ "service": "one of the five services", "outcome": "1 sentence tied to a finding" }]
}
`.trim();

    let raw: Partial<AuditReport>;
    try {
        raw = await callGeminiJson<Partial<AuditReport>>(prompt);
    } catch (error) {
        return {
            ok: false,
            message: `Audit generation failed: ${String(error)}`,
            quotaExhausted: isQuotaError(error),
        };
    }

    return applyAudit(db, lead, raw);
}

export async function applyAudit(
    db: Db,
    lead: Lead,
    raw: Partial<AuditReport>
): Promise<StepResult> {
    const id = lead._id.toString();
    const auditReport = normalizeAuditReport(raw, lead);

    if (auditReport.areas.length === 0) {
        return { ok: false, message: "Audit generation returned no findings. Try again." };
    }

    const auditSlug = lead.auditSlug || `${slugify(lead.companyName)}-${id.slice(-6)}`;

    await updateLead(db, id, {
        auditSlug,
        // Kept alongside the full report: the dashboard and outreach still
        // read the one-paragraph summary.
        auditSummary: auditReport.executiveSummary,
        auditReport,
        auditGeneratedAt: new Date().toISOString(),
    });

    await logActivity(db, id, "audit_generated", "Growth audit generated");

    return { ok: true, message: "Audit generated.", data: { auditSlug } };
}

// --- Demo -----------------------------------------------------------------
//
// One Gemini call writes a JSON "site brief": positioning, palette, fonts,
// visual style, and real copy for five pages, built from everything actually
// known about this lead (score breakdown, problems, competitors, and a scrape
// of their current site). lib/demo-site.ts renders that brief into a complete
// multi-page site. Making every creative decision explicit in the brief is
// what keeps the result from reading like a template with the name swapped in.

/** A short, plain-text scrape of the lead's current homepage, when they have
 *  one — grounds the brief in what's actually there instead of guessing from
 *  niche alone. Best-effort: a failed fetch just means a plainer brief, same
 *  as the SSRF-guarded fetch already used during enrichment. */
export async function scrapeHomepageSnippet(website?: string): Promise<string> {
    if (!website) return "";
    try {
        const html = await fetchExternalText(website);
        if (!html) return "";
        return html
            // "|$" also strips a block left unclosed where the page was cut off.
            .replace(/<script[\s\S]*?(<\/script>|$)/gi, " ")
            .replace(/<style[\s\S]*?(<\/style>|$)/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 3000);
    } catch {
        return "";
    }
}

export async function generateDemo(db: Db, lead: Lead): Promise<StepResult> {

    if (!lead.growthScore) {
        return { ok: false, message: "Analyze this lead before generating a demo." };
    }
    if (!process.env.AI_API_KEY) return aiUnavailable("demo generation");

    const competitors = (lead.competitors || []) as { name: string; strength: string }[];
    const [homepageSnippet, brand] = await Promise.all([
        scrapeHomepageSnippet(lead.website),
        fetchBrandAssets(lead.website),
    ]);

    const briefPrompt = `
You are the creative director at RMAST STUDIO, planning a five-page demo
website for ONE specific business. Every decision must be something a
different company in a different city could NOT also claim, nothing generic
enough that the name could be swapped for another business and reused as-is.

Business: ${lead.companyName}
Niche: ${lead.niche}
Location: ${lead.location}, ${lead.market}
Existing website: ${lead.website || "none, this business has no site today"}
${homepageSnippet
            ? `Text scraped from their current homepage, for grounding only (do not copy phrases verbatim):\n"""\n${homepageSnippet}\n"""\n`
            : ""
        }
Growth score: ${lead.growthScore}/100
Score breakdown: ${JSON.stringify(lead.scores || {})}
Specific problems found: ${(lead.problems || []).join("; ") || "weak general online presence"}
${competitors.length > 0
            ? `Local competitors (for your own positioning judgment only, never name them in the copy):\n${competitors
                .map((c) => `- ${c.name}: ${c.strength}`)
                .join("\n")}\n`
            : ""
        }
The site has five pages: Home, About, Services, a fourth page that fits this
niche best (e.g. "Menu" for a restaurant, "Listings" for real estate,
"Projects" for a builder, "Gallery" for a salon, "Work" for an agency), and
Contact. Decide:

1. siteName (usually the business name) and a short tagline.
2. style: one of "bold" (dark, punchy hero), "elegant" (refined, luxury),
   "warm" (friendly, soft, rounded) or "minimal" (clean, airy). Pick what
   suits this business's customers.
3. A 5-color palette as hex codes. ${brand.colors.length > 0
            ? `Their existing brand colors, taken from their own website, are ${brand.colors.join(", ")}. The demo must look like THEIR brand: primary and accent MUST be chosen from these exact hex codes; pick secondary, background and text to complement them.`
            : "Make it specific to the niche, never default blue/white/gray."
        } background and text must have strong contrast; accent must stand out on
   both background and primary.
4. Two Google Fonts: a distinctive heading font and a readable body font.
5. Home: hero headline (under 10 words), one-sentence subheadline referencing
   something concrete about the business, CTA button label, 3 highlights
   (each a visible fix for one of the problems above, written as a benefit to
   the customer), and an intro heading plus 2-3 sentences.
6. About: heading, one-sentence intro, a 2-3 paragraph story, 3 values.
7. Services: heading, intro, 4-6 services this business plausibly offers,
   each with a 1-2 sentence description.
8. The fourth page: navLabel (1-2 words), heading, intro, 3-6 items each
   with a title, 1-2 sentences and a short tag.
9. 3 short example testimonials (first name + context, e.g. "Sara, homeowner").
10. 4 FAQs a real customer of this business would ask, with answers.
11. Contact heading and intro; a closing CTA headline and one line.

Never invent prices, awards, years in business, client counts or statistics.
Never use: "Welcome to", "Your trusted partner", "take your business to the
next level", "in today's digital age", "state-of-the-art", "boost your online
presence", "stand out from the competition", or lorem ipsum. Plain text only.

Return JSON exactly:
{ "demoDescription": "2-3 sentences describing this demo for an internal dashboard",
  "siteName": "...", "tagline": "...", "style": "bold|elegant|warm|minimal",
  "colorPalette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
  "headingFont": "Google Font name", "bodyFont": "Google Font name",
  "home": { "heroHeadline": "...", "heroSubheadline": "...", "primaryCta": "...",
            "introHeading": "...", "introCopy": "...",
            "highlights": [{ "title": "...", "text": "..." }] },
  "about": { "heading": "...", "intro": "...", "story": ["paragraph"], "values": [{ "title": "...", "text": "..." }] },
  "services": { "heading": "...", "intro": "...", "items": [{ "name": "...", "description": "..." }] },
  "showcase": { "navLabel": "...", "heading": "...", "intro": "...", "items": [{ "title": "...", "text": "...", "tag": "..." }] },
  "testimonials": [{ "quote": "...", "name": "...", "role": "..." }],
  "faq": [{ "question": "...", "answer": "..." }],
  "contact": { "heading": "...", "intro": "..." },
  "ctaHeadline": "...", "ctaText": "..." }
`.trim();

    let rawBrief: unknown;
    try {
        rawBrief = await callGeminiJson<unknown>(briefPrompt);
    } catch (error) {
        return {
            ok: false,
            message: `Demo generation failed: ${String(error)}`,
            quotaExhausted: isQuotaError(error),
        };
    }

    return applyDemoBrief(db, lead, rawBrief, brand);
}

/** Renders a demo site from a brief, whoever wrote it, and saves it. */
export async function applyDemoBrief(
    db: Db,
    lead: Lead,
    rawBrief: unknown,
    brand: BrandAssets
): Promise<StepResult> {
    const id = lead._id.toString();
    const business = {
        companyName: String(lead.companyName),
        niche: String(lead.niche || ""),
        location: String(lead.location || ""),
        market: String(lead.market || ""),
        phone: typeof lead.phone === "string" ? lead.phone : undefined,
        email: typeof lead.email === "string" ? lead.email : undefined,
        problems: Array.isArray(lead.problems) ? (lead.problems as string[]) : [],
        logoUrl: brand.logoUrl,
        logoTone: brand.logoTone,
        images: brand.images,
    };
    const brief: DemoSiteBrief = normalizeDemoSiteBrief(rawBrief, business);

    // The prompt asks for the brand's own colors; this makes sure of it in
    // case the model drifted to a palette of its own.
    const brandColors = brand.colors.map((c) => c.toLowerCase());
    if (brandColors.length > 0) {
        const palette = brief.colorPalette;
        if (!brandColors.includes(palette.primary.toLowerCase())) palette.primary = brandColors[0];
        if (brandColors.length > 1 && !brandColors.includes(palette.accent.toLowerCase())) {
            palette.accent = brandColors.find((c) => c !== palette.primary.toLowerCase()) || palette.accent;
        }
    }

    const demoHtml = renderDemoSite(brief, business);

    await updateLead(db, id, {
        demoUrl: `/demo/${id}`,
        demoHtml,
        demoDescription: brief.demoDescription,
        demoGeneratedAt: new Date().toISOString(),
    });

    await logActivity(
        db,
        id,
        "demo_generated",
        "Personalized five-page demo website generated"
    );

    return {
        ok: true,
        message: "Demo generated.",
        data: {
            demoDescription: brief.demoDescription,
            brandColors: brand.colors,
            photosFound: brand.images.length,
            logoFound: Boolean(brand.logoUrl),
        },
    };
}

// --- Outreach -------------------------------------------------------------

const GENERIC_PHRASES = [
    "grow your business",
    "boost your online presence",
    "take your business to the next level",
    "unlock your potential",
    "stand out from the competition",
    "in today's digital age",
];

function looksGeneric(message: string): boolean {
    const lower = message.toLowerCase();
    const genericHits = GENERIC_PHRASES.filter((p) => lower.includes(p)).length;
    return genericHits >= 2;
}

export const OUTREACH_CHANNELS = [
    "email",
    "whatsapp",
    "instagram",
    "facebook",
    "linkedin",
] as const;

/**
 * The exact, absolute URLs for the audit report and demo page. These are
 * never left to the model to reproduce — asking an LLM to "include a link
 * naturally" in prose reliably gets it paraphrased, shortened, or subtly
 * wrong. Every outreach message gets the real thing, appended verbatim.
 */
function buildOutreachLinks(lead: Lead): { auditLink?: string; demoLink?: string } {
    const appUrl = publicAppUrl();
    return {
        auditLink: lead.auditSlug ? `${appUrl}/audit/${lead.auditSlug}` : undefined,
        demoLink: lead.demoUrl ? `${appUrl}${lead.demoUrl}` : undefined,
    };
}

/** The one place these links reach the message — appended after the AI copy,
 *  never generated by it, so they can never come out truncated or wrong. */
function appendOutreachLinks(
    message: string,
    auditLink: string | undefined,
    demoLink: string | undefined
): string {
    const lines: string[] = [];
    if (auditLink) lines.push(`Growth Report: ${auditLink}`);
    if (demoLink) lines.push(`Live Demo: ${demoLink}`);
    return lines.length > 0 ? `${message}\n\n${lines.join("\n")}` : message;
}

function buildOutreachPrompt(
    lead: Lead,
    channel: string,
    auditLink: string | undefined,
    demoLink: string | undefined
): string {
    const competitors = (lead.competitors || []) as {
        name: string;
        strength: string;
    }[];

    const competitorSection =
        competitors.length > 0
            ? `
Local competitors for reference (mention ONE of these if it strengthens
the message, naming the competitor and their specific advantage):
${competitors.map((c) => `- ${c.name}: ${c.strength}`).join("\n")}
`
            : "";

    const preparedAssets = [
        auditLink ? "a personalized growth report" : null,
        demoLink ? "a personalized demo webpage" : null,
    ]
        .filter(Boolean)
        .join(" and ");

    const linkInstruction = preparedAssets
        ? `\nYou have already prepared ${preparedAssets} for this business. In ONE short sentence near the end, mention that it's ready and worth a look. Do NOT write out a URL, a link, or placeholder link text like "[link]" or "click here" — the exact links are appended after your message automatically, verbatim.\n`
        : "";

    return `
You are writing a cold outreach message on behalf of RMAST STUDIO, a growth
agency offering: Website Development, Software Development, Social Media
Management, Bookkeeping, and Virtual Assistant services.

Business being contacted:
- Name: ${lead.companyName}
- Niche: ${lead.niche}
- Location: ${lead.location}, ${lead.market}
- Website: ${lead.website || "none found"}

Specific analysis findings for THIS business (use these, do not invent new ones):
- Score breakdown: ${JSON.stringify(lead.scores || {})}
- Specific problems found: ${(lead.problems || []).join("; ") || "none recorded"}
- Recommended fixes: ${(lead.recommendations || []).join("; ") || "none recorded"}
${competitorSection}${linkInstruction}
Rules:
1. Reference at least one CONCRETE, SPECIFIC detail from the findings above.
2. Do NOT use generic filler phrases like "grow your business," "boost your
   online presence," "take it to the next level," "unlock your potential,"
   or "stand out from the competition."
3. Keep it short (2-4 sentences), friendly, and low-pressure.
4. If a competitor comparison is provided above, weave it in naturally as
   a light, non-aggressive nudge — not a harsh callout.
5. Only mention RMAST services from the list above — never suggest anything
   RMAST doesn't offer.
6. Do not sound like a template with the name swapped in.
7. Never write a URL, a link, or bracketed placeholder text for one — see
   the note above about links being appended automatically.

Write ONE message suitable for ${channel}. Return only the message text, nothing else.
`.trim();
}

export async function generateOutreach(db: Db, lead: Lead): Promise<StepResult> {

    if (!lead.growthScore) {
        return {
            ok: false,
            message: "Analyze this lead before generating outreach messages.",
        };
    }
    if (!process.env.AI_API_KEY) return aiUnavailable("message generation");

    const { auditLink, demoLink } = buildOutreachLinks(lead);
    const outreachMessages: Record<string, string> = {};

    for (const channel of OUTREACH_CHANNELS) {
        const prompt = buildOutreachPrompt(lead, channel, auditLink, demoLink);

        try {
            let message = await callGemini(prompt);

            if (looksGeneric(message)) {
                message = await callGemini(
                    prompt +
                    "\n\nYour previous attempt was too generic. Try again with a more specific, concrete detail from the findings."
                );
            }

            outreachMessages[channel] = message.trim();
        } catch (error) {
            // One failed channel shouldn't discard the ones that worked.
            if (isQuotaError(error) && Object.keys(outreachMessages).length === 0) {
                return {
                    ok: false,
                    message:
                        "Outreach generation skipped: Gemini quota reached. Try again later.",
                    quotaExhausted: true,
                };
            }
            console.warn(`[pipeline] outreach failed for ${channel}:`, String(error));
        }
    }

    return applyOutreach(db, lead, outreachMessages);
}

/** Saves outreach drafts (one per channel), appending the real audit and demo
 *  links here rather than trusting whoever wrote the copy to include them. */
export async function applyOutreach(
    db: Db,
    lead: Lead,
    raw: Record<string, unknown>
): Promise<StepResult> {
    const id = lead._id.toString();
    const { auditLink, demoLink } = buildOutreachLinks(lead);
    const outreachMessages: Record<string, string> = {};
    for (const channel of OUTREACH_CHANNELS) {
        const message = raw[channel];
        if (typeof message === "string" && message.trim()) {
            outreachMessages[channel] = appendOutreachLinks(message.trim(), auditLink, demoLink);
        }
    }

    if (Object.keys(outreachMessages).length === 0) {
        return { ok: false, message: "Outreach generation produced no messages." };
    }

    await updateLead(db, id, {
        outreachMessages,
        outreachGeneratedAt: new Date().toISOString(),
    });

    await logActivity(
        db,
        id,
        "outreach_generated",
        `Outreach messages generated for ${Object.keys(outreachMessages).length} channel(s)`
    );

    const missing = [
        !auditLink ? "no growth report generated yet" : null,
        !demoLink ? "no demo generated yet" : null,
    ].filter(Boolean);

    return {
        ok: true,
        message: "Outreach messages generated.",
        data: {
            outreachMessages,
            warning:
                missing.length > 0
                    ? `Generated without a link — ${missing.join(" and ")}. Run that step and regenerate outreach to include it.`
                    : undefined,
        },
    };
}
