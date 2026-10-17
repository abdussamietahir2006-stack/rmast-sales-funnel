"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { AuditArea, AuditReport } from "@/models/lead";

const STATUS_STYLES: Record<AuditArea["status"], { text: string; bar: string; chip: string }> = {
    strong: { text: "text-[#4ADE80]", bar: "bg-[#4ADE80]", chip: "border-[#1E3A2B] bg-[#121C16] text-[#4ADE80]" },
    "needs work": { text: "text-[#FBBF24]", bar: "bg-[#FBBF24]", chip: "border-[#423219] bg-[#1B1710] text-[#FBBF24]" },
    critical: { text: "text-[#FB7185]", bar: "bg-[#FB7185]", chip: "border-[#4C1D24] bg-[#1F1015] text-[#FB7185]" },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">{children}</h2>;
}

function BulletList({ items, mark, color }: { items: string[]; mark: string; color: string }) {
    return (
        <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                    <span className={`${color} font-bold shrink-0`}>{mark}</span>
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

function FullReport({ report }: { report: AuditReport }) {
    const snapshot = [
        { label: "What you do", value: report.snapshot.whatTheyDo },
        { label: "Who you serve", value: report.snapshot.targetCustomers },
        { label: "Online presence", value: report.snapshot.onlinePresence },
    ].filter((s) => s.value);

    return (
        <>
            {snapshot.length > 0 && (
                <div className="mt-8 grid gap-3.5 sm:grid-cols-3">
                    {snapshot.map((s) => (
                        <div key={s.label} className="rounded-xl border border-[#132E32] bg-[#091215] p-5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Scorecard overview */}
            <div className="mt-10">
                <SectionTitle>Business Scorecard</SectionTitle>
                <div className="space-y-3 rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-xl">
                    {report.areas.map((a, i) => {
                        const style = STATUS_STYLES[a.status];
                        return (
                            <a key={a.area} href={`#area-${i}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[220px_1fr_auto]">
                                <span className="text-sm font-medium text-slate-300 group-hover:text-white">{a.area}</span>
                                <span className="col-span-2 row-start-2 h-2 overflow-hidden rounded-full bg-[#132E32] sm:col-span-1 sm:row-start-auto">
                                    <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${a.score}%` }} />
                                </span>
                                <span className={`tabular-nums text-sm font-bold ${style.text}`}>{a.score}</span>
                            </a>
                        );
                    })}
                </div>
            </div>

            {(report.strengths.length > 0 || report.quickWins.length > 0) && (
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                    {report.strengths.length > 0 && (
                        <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-6">
                            <h3 className="mb-3 text-sm font-semibold text-[#4ADE80]">What you&apos;re doing well</h3>
                            <BulletList items={report.strengths} mark="✓" color="text-[#4ADE80]" />
                        </div>
                    )}
                    {report.quickWins.length > 0 && (
                        <div className="rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#070C0E] p-6">
                            <h3 className="mb-3 text-sm font-semibold text-[#FBBF24]">Quick wins for this week</h3>
                            <BulletList items={report.quickWins} mark="→" color="text-[#FBBF24]" />
                        </div>
                    )}
                </div>
            )}

            {/* Area by area */}
            <div className="mt-10">
                <SectionTitle>Area-by-Area Findings</SectionTitle>
                <div className="space-y-4">
                    {report.areas.map((a, i) => {
                        const style = STATUS_STYLES[a.status];
                        return (
                            <section key={a.area} id={`area-${i}`} className="scroll-mt-6 rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <h3 className="text-base font-bold text-white">{a.area}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${style.chip}`}>{a.status}</span>
                                        <span className={`tabular-nums text-lg font-black ${style.text}`}>{a.score}<span className="text-xs font-semibold text-slate-500">/100</span></span>
                                    </div>
                                </div>
                                <div className="grid gap-6 sm:grid-cols-2">
                                    {a.findings.length > 0 && (
                                        <div>
                                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">What we found</p>
                                            <BulletList items={a.findings} mark="•" color="text-slate-500" />
                                        </div>
                                    )}
                                    {a.recommendations.length > 0 && (
                                        <div>
                                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">What to do</p>
                                            <BulletList items={a.recommendations} mark="✓" color="text-[#2DD4BF]" />
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>

            {report.actionPlan.length > 0 && (
                <div className="mt-10">
                    <SectionTitle>Your 90-Day Plan</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {report.actionPlan.map((phase, i) => (
                            <div key={phase.phase} className="rounded-xl border border-[#132E32] bg-[#091215] p-5">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-[#2DD4BF]">Phase {i + 1}</p>
                                <h3 className="mb-3 mt-0.5 text-sm font-bold text-white">{phase.phase}</h3>
                                <BulletList items={phase.items} mark="•" color="text-[#2DD4BF]" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {report.howWeHelp.length > 0 && (
                <div className="mt-10">
                    <SectionTitle>How RMAST STUDIO Can Help</SectionTitle>
                    <div className="grid gap-3.5 sm:grid-cols-2">
                        {report.howWeHelp.map((h) => (
                            <div key={h.service} className="rounded-xl border border-[#164E53] bg-[#0E1D1F] p-5">
                                <p className="text-sm font-bold text-[#2DD4BF]">{h.service}</p>
                                <p className="mt-1 text-sm leading-relaxed text-slate-300">{h.outcome}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

interface AuditData {
    companyName: string;
    niche?: string;
    location?: string;
    auditReport?: AuditReport;
    growthScore?: number;
    scores?: {
        website: number;
        social: number;
        leadGeneration: number;
        conversion: number;
        seo: number;
        branding: number;
    };
    problems?: string[];
    recommendations?: string[];
    auditSummary?: string;
    demoUrl?: string;
    /**
     * The audit's own slug. The API used to hand the browser the lead's
     * database id, which meant the authenticated lead endpoints had to stay
     * public for booking to work — and anyone could then act on any lead.
     */
    bookingSlug: string;
}

export default function AuditPage() {
    const params = useParams();
    const [audit, setAudit] = useState<AuditData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [showBooking, setShowBooking] = useState(false);
    const [scheduledAt, setScheduledAt] = useState("");
    const [serviceInterest, setServiceInterest] = useState("");
    const [budget, setBudget] = useState("");
    const [timeline, setTimeline] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [booked, setBooked] = useState(false);
    const [bookingError, setBookingError] = useState("");

    useEffect(() => {
        async function fetchAudit() {
            const res = await fetch(`/api/audit/${params.slug}`);
            if (res.ok) {
                const data = await res.json();
                setAudit(data.audit);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        }
        fetchAudit();
    }, [params.slug]);

    async function handleBooking(e: React.FormEvent) {
        e.preventDefault();
        if (!audit) return;

        setSubmitting(true);
        setBookingError("");

        try {
            const res = await fetch(
                `/api/public/audit/${encodeURIComponent(audit.bookingSlug)}/book`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scheduledAt,
                        serviceInterest,
                        budget,
                        timeline,
                    }),
                }
            );

            if (res.ok) {
                setBooked(true);
            } else {
                const data = await res.json().catch(() => ({}));
                setBookingError(
                    data.error || "We couldn't book that slot. Please try again."
                );
            }
        } catch {
            setBookingError("We couldn't reach the server. Please try again.");
        }

        setSubmitting(false);
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#070C0E] text-slate-400">
                <div className="flex items-center gap-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2DD4BF] border-t-transparent" />
                    <p className="text-sm font-medium tracking-wide">Loading Analysis...</p>
                </div>
            </div>
        );
    }

    if (notFound || !audit) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#070C0E] text-slate-400">
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center shadow-lg">
                    <p className="text-sm font-medium text-slate-300">This audit report could not be found.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#070C0E] text-slate-100 antialiased selection:bg-[#2DD4BF]/30 selection:text-[#2DD4BF]">
            <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
                {/* Header */}
                <div className="mb-10 text-center sm:text-left border-b border-[#132E32] pb-8">
                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                        <div className="h-3.5 w-1 rounded-full bg-[#2DD4BF]" />
                        <span className="text-xs font-extrabold uppercase tracking-widest text-[#2DD4BF]">RMAST STUDIO BUSINESS AUDIT</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                        {audit.companyName}&apos;s Business Audit
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">
                        {[audit.niche, audit.location].filter(Boolean).join(" · ") || "Complete business & growth assessment"}
                    </p>
                </div>

                {/* Score Card */}
                {audit.growthScore !== undefined && audit.growthScore !== null ? (
                    <div className="relative overflow-hidden rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] via-[#091215] to-[#121C16] p-8 text-center shadow-xl">
                        <div className="absolute top-0 right-0 h-32 w-32 bg-[#0D9488]/15 rounded-full blur-2xl pointer-events-none" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF] mb-2">Overall Growth Score</p>
                        <p className="tabular-nums text-6xl font-black tracking-tight text-[#2DD4BF]">
                            {audit.growthScore}<span className="text-2xl font-semibold text-slate-500">/100</span>
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400">
                        Analysis is currently in progress.
                    </div>
                )}

                {/* Summary */}
                {(audit.auditReport?.executiveSummary || audit.auditSummary) && (
                    <div className="mt-8 rounded-xl border border-[#132E32] bg-[#091215] p-6 text-slate-300 text-sm leading-relaxed shadow-lg">
                        {audit.auditReport && (
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#2DD4BF]">Executive Summary</p>
                        )}
                        <p>{audit.auditReport?.executiveSummary || audit.auditSummary}</p>
                    </div>
                )}

                {audit.auditReport && <FullReport report={audit.auditReport} />}

                {/* Older audits, generated before the full report existed */}
                {!audit.auditReport && audit.scores && (
                    <div className="mt-8">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Category Diagnostics</h2>
                        <div className="grid grid-cols-2 gap-3.5 rounded-xl border border-[#132E32] bg-[#091215] p-6 sm:grid-cols-3 shadow-xl">
                            <div className="rounded-lg bg-[#0E1D1F] p-3.5 border border-[#164E53]">
                                <p className="text-xs text-slate-400 font-medium">Website</p>
                                <p className="tabular-nums text-xl font-bold text-[#2DD4BF] mt-1">{audit.scores.website}<span className="text-xs text-slate-500">/100</span></p>
                            </div>
                            <div className="rounded-lg bg-[#121C16] p-3.5 border border-[#1E3A2B]">
                                <p className="text-xs text-slate-400 font-medium">Social Media</p>
                                <p className="tabular-nums text-xl font-bold text-[#4ADE80] mt-1">{audit.scores.social}<span className="text-xs text-slate-500">/100</span></p>
                            </div>
                            <div className="rounded-lg bg-[#1F1015] p-3.5 border border-[#4C1D24]">
                                <p className="text-xs text-slate-400 font-medium">Lead Generation</p>
                                <p className="tabular-nums text-xl font-bold text-[#FB7185] mt-1">{audit.scores.leadGeneration}<span className="text-xs text-slate-500">/100</span></p>
                            </div>
                            <div className="rounded-lg bg-[#1B1710] p-3.5 border border-[#423219]">
                                <p className="text-xs text-slate-400 font-medium">Conversion</p>
                                <p className="tabular-nums text-xl font-bold text-[#FBBF24] mt-1">{audit.scores.conversion}<span className="text-xs text-slate-500">/100</span></p>
                            </div>
                            <div className="rounded-lg bg-[#0E1D1F] p-3.5 border border-[#164E53]">
                                <p className="text-xs text-slate-400 font-medium">SEO</p>
                                <p className="tabular-nums text-xl font-bold text-[#2DD4BF] mt-1">{audit.scores.seo}<span className="text-xs text-slate-500">/100</span></p>
                            </div>
                            <div className="rounded-lg bg-[#121C16] p-3.5 border border-[#1E3A2B]">
                                <p className="text-xs text-slate-400 font-medium">Branding</p>
                                <p className="tabular-nums text-xl font-bold text-[#4ADE80] mt-1">{audit.scores.branding}<span className="text-xs text-slate-500">/100</span></p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Problems / Top Opportunities */}
                {!audit.auditReport && audit.problems && audit.problems.length > 0 && (
                    <div className="mt-8 rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#070C0E] p-6 shadow-xl">
                        <h2 className="mb-3 text-sm font-semibold tracking-tight text-[#FB7185] flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#FB7185]" />
                            Top Growth Bottlenecks Identified
                        </h2>
                        <ul className="space-y-2.5 text-sm leading-relaxed text-slate-300">
                            {audit.problems.map((p, i) => (
                                <li key={i} className="flex items-start gap-2.5">
                                    <span className="text-[#FB7185] font-bold shrink-0 mt-0.5">•</span>
                                    <span>{p}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Recommendations */}
                {!audit.auditReport && audit.recommendations && audit.recommendations.length > 0 && (
                    <div className="mt-6 rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-6 shadow-xl">
                        <h2 className="mb-3 text-sm font-semibold tracking-tight text-[#4ADE80] flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                            What We Recommend
                        </h2>
                        <ul className="space-y-2.5 text-sm leading-relaxed text-slate-300">
                            {audit.recommendations.map((r, i) => (
                                <li key={i} className="flex items-start gap-2.5">
                                    <span className="text-[#4ADE80] font-bold shrink-0 mt-0.5">✓</span>
                                    <span>{r}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Demo CTA */}
                {audit.demoUrl && (
                    <div className="mt-8 text-center sm:text-left">
                        <Link
                            href={audit.demoUrl}
                            className="inline-flex items-center gap-2 rounded-lg border border-[#164E53] bg-[#0E1D1F] px-5 py-3 text-sm font-semibold text-[#2DD4BF] transition-all duration-200 hover:bg-[#0D9488]/20 shadow-[0_0_15px_rgba(20,184,166,0.2)]"
                        >
                            <span>View Your Demo Website</span>
                            <span>→</span>
                        </Link>
                    </div>
                )}

                {/* Strategy Call Booking Section */}
                <div className="mt-12 border-t border-[#132E32] pt-10">
                    {booked ? (
                        <div className="rounded-xl border border-[#059669]/40 bg-[#059669]/10 p-6 text-center text-[#34D399] font-semibold text-sm">
                            ✓ Your call is booked! Our team will review your report and connect shortly.
                        </div>
                    ) : !showBooking ? (
                        <div className="rounded-xl border border-[#132E32] bg-gradient-to-br from-[#091215] to-[#0E1D1F] p-8 text-center shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-2">Ready to scale your conversion pipeline?</h3>
                            <p className="text-xs text-slate-400 mb-6">Schedule a 1-on-1 strategy briefing with RMAST STUDIO.</p>
                            <button
                                onClick={() => setShowBooking(true)}
                                className="rounded-lg bg-gradient-to-r from-[#0D9488] via-[#059669] to-[#4D7C0F] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-200 hover:opacity-95 active:scale-[0.98]"
                            >
                                Book a Strategy Call
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleBooking} className="space-y-5 rounded-xl border border-[#132E32] bg-[#091215] p-8 shadow-xl">
                            <div className="border-b border-[#132E32] pb-4 mb-2">
                                <h2 className="text-lg font-bold tracking-tight text-white">Book Your Strategy Call</h2>
                                <p className="text-xs text-slate-400">Select your preferences below to reserve your slot.</p>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                    Preferred Date & Time
                                </label>
                                <input
                                    required
                                    type="datetime-local"
                                    value={scheduledAt}
                                    onChange={(e) => setScheduledAt(e.target.value)}
                                    className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none transition-all duration-200"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                    Service Interested In
                                </label>
                                <select
                                    value={serviceInterest}
                                    onChange={(e) => setServiceInterest(e.target.value)}
                                    className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none transition-all duration-200"
                                >
                                    <option value="">Select...</option>
                                    <option value="Website Development">Website Development</option>
                                    <option value="Software Development">Software Development</option>
                                    <option value="Social Media Management">Social Media Management</option>
                                    <option value="Bookkeeping">Bookkeeping</option>
                                    <option value="Virtual Assistant">Virtual Assistant</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Budget</label>
                                <select
                                    value={budget}
                                    onChange={(e) => setBudget(e.target.value)}
                                    className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none transition-all duration-200"
                                >
                                    <option value="">Select...</option>
                                    <option value="$1,000–$2,500">$1,000 – $2,500</option>
                                    <option value="$2,500–$5,000">$2,500 – $5,000</option>
                                    <option value="$5,000+">$5,000+</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                    Timeline
                                </label>
                                <select
                                    value={timeline}
                                    onChange={(e) => setTimeline(e.target.value)}
                                    className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none transition-all duration-200"
                                >
                                    <option value="">Select...</option>
                                    <option value="Immediately">Immediately</option>
                                    <option value="1 month">1 month</option>
                                    <option value="3 months">3 months</option>
                                    <option value="Exploring">Exploring</option>
                                </select>
                            </div>
                            {bookingError && (
                                <div className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-3.5 py-2.5 text-xs text-[#FB7185]">
                                    {bookingError}
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full rounded-lg bg-gradient-to-r from-[#0D9488] via-[#059669] to-[#4D7C0F] py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-200 hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                            >
                                {submitting ? "Booking..." : "Confirm Booking"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}