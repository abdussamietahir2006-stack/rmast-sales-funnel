export interface AnalysisScores {
    website: number;
    social: number;
    leadGeneration: number;
    conversion: number;
    seo: number;
    branding: number;
}

export interface OutreachMessages {
    email?: string;
    whatsapp?: string;
    instagram?: string;
    facebook?: string;
    linkedin?: string;
}

/**
 * A competitor found by AI-grounded search for one specific lead — its name,
 * its real website if one was found, and one honest advantage sentence. This
 * is directional market research, never verified data, and lib/pipeline.ts
 * strips anything beyond these fields before storage — it must never carry a
 * phone number, email, or other contact detail. Shown only on the originating
 * lead's own page, never as a cross-lead directory.
 */
export interface Competitor {
    name: string;
    website?: string;
    score?: number;
    strength: string;
}

export type LeadStatus =
    | "New"
    | "Analyzing"
    | "Analyzed"
    | "Contacted"
    | "Replied"
    | "Qualified"
    | "Won"
    | "Lost";

export interface Lead {
    _id?: string;
    campaignId?: string;
    companyName: string;
    niche: string;
    market: string;
    location: string;
    website?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
    /** Google Places id, kept so a lead can be re-fetched or de-duplicated. */
    placeId?: string;
    /** Normalized companyName|market, used for duplicate detection. */
    dedupeKey?: string;
    ownerName?: string;
    contactSource?: "website" | "enrichment" | "google_places" | "manual";
    contactMethod?: "direct" | "social_manual" | "unreachable";
    hasVerifiedEmail?: boolean;
    status: LeadStatus;
    /**
     * AI-judged confidence (0-100) that this business is still actually
     * operating, from a grounded search plus a website-reachability check —
     * catches a Google Places listing that never got updated after the
     * business really closed. "inactive" leads are skipped by the scheduled
     * run but never blocked from a manual, operator-triggered action.
     */
    activityScore?: number;
    activitySignals?: string[];
    activityVerdict?: "active" | "review" | "inactive";
    activityCheckedAt?: string;
    growthScore?: number;
    scores?: AnalysisScores;
    problems?: string[];
    recommendations?: string[];
    analyzedAt?: string;
    enrichedAt?: string;
    competitors?: Competitor[];
    competitorsGeneratedAt?: string;
    auditSlug?: string;
    auditSummary?: string;
    auditGeneratedAt?: string;
    auditLastViewedAt?: string;
    auditViewCount?: number;
    demoUrl?: string;
    demoHtml?: string;
    demoDescription?: string;
    demoGeneratedAt?: string;
    demoLastViewedAt?: string;
    demoViewCount?: number;
    outreachMessages?: OutreachMessages;
    outreachGeneratedAt?: string;
    firstContactedAt?: string;
    firstReplyAt?: string;
    /** True once the lead has unsubscribed or replied "not interested". */
    optedOut?: boolean;
    optedOutAt?: string;
    optedOutReason?: string;
    winLossReason?: string;
    closedAt?: string;
    duplicateOf?: string;
    createdAt: string;
}
