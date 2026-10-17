"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface AnalysisScores {
    website: number;
    social: number;
    leadGeneration: number;
    conversion: number;
    seo: number;
    branding: number;
}

interface OutreachMessages {
    email?: string;
    whatsapp?: string;
    instagram?: string;
    facebook?: string;
    linkedin?: string;
}

interface Competitor {
    name: string;
    website?: string;
    score?: number;
    strength: string;
}

interface Lead {
    _id: string;
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
    ownerName?: string;
    ownerTitle?: string;
    ownerLinkedin?: string;
    licenseInfo?: string;
    contactMethod?: string;
    status: string;
    activityScore?: number;
    activitySignals?: string[];
    activityVerdict?: "active" | "review" | "inactive";
    activityCheckedAt?: string;
    growthScore?: number;
    scores?: AnalysisScores;
    problems?: string[];
    recommendations?: string[];
    competitors?: Competitor[];
    auditSlug?: string;
    demoUrl?: string;
    outreachMessages?: OutreachMessages;
    optedOut?: boolean;
    optedOutReason?: string;
    createdAt: string;
}

interface Message {
    _id: string;
    channel: string;
    direction: string;
    content: string;
    sentAt: string;
    /** Open tracking, set on sent emails by the tracking pixel. */
    openCount?: number;
    firstOpenedAt?: string;
    lastOpenedAt?: string;
}

interface Note {
    _id: string;
    content: string;
    createdAt: string;
}

interface Activity {
    _id: string;
    type: string;
    description: string;
    createdAt: string;
}

const CHANNELS = [
    { key: "email", label: "Email" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "instagram", label: "Instagram" },
    { key: "facebook", label: "Facebook" },
    { key: "linkedin", label: "LinkedIn" },
];

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    return (
        <button
            onClick={handleCopy}
            disabled={!text}
            className="shrink-0 rounded-lg border border-[#132E32] bg-[#070C0E] px-3 py-1.5 text-xs font-semibold text-[#2DD4BF] transition-all duration-200 hover:bg-[#0D9488]/20 disabled:opacity-40"
        >
            {copied ? "Copied ✓" : "Copy"}
        </button>
    );
}

function getStatusBadgeClass(status: string) {
    const s = (status || "").toLowerCase();
    if (s.includes("won") || s.includes("replied") || s.includes("positive") || s.includes("new")) {
        return "bg-[#059669]/20 text-[#34D399] border-[#059669]/40";
    }
    if (s.includes("analyz") || s.includes("qualif") || s.includes("pending")) {
        return "bg-[#D97706]/20 text-[#FBBF24] border-[#D97706]/40";
    }
    if (s.includes("contact") || s.includes("outreach") || s.includes("sent")) {
        return "bg-[#0D9488]/20 text-[#2DD4BF] border-[#0D9488]/40";
    }
    if (s.includes("lost") || s.includes("unreachable")) {
        return "bg-[#9F1239]/20 text-[#FB7185] border-[#9F1239]/40";
    }
    return "bg-slate-800 text-slate-300 border-slate-700";
}

export default function LeadDetailPage() {
    const params = useParams();
    const [lead, setLead] = useState<Lead | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [verifyingActivity, setVerifyingActivity] = useState(false);
    const [activityMessage, setActivityMessage] = useState("");

    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeMessage, setAnalyzeMessage] = useState("");

    const [enriching, setEnriching] = useState(false);
    const [enrichMessage, setEnrichMessage] = useState("");

    const [findingCompetitors, setFindingCompetitors] = useState(false);
    const [competitorsMessage, setCompetitorsMessage] = useState("");

    const [generatingAudit, setGeneratingAudit] = useState(false);
    const [auditMessage, setAuditMessage] = useState("");

    const [generatingDemo, setGeneratingDemo] = useState(false);
    const [demoMessage, setDemoMessage] = useState("");

    const [generatingOutreach, setGeneratingOutreach] = useState(false);
    const [outreachMessage, setOutreachMessage] = useState("");

    const [sendingChannel, setSendingChannel] = useState<string | null>(null);
    const [sendMessage, setSendMessage] = useState("");
    // Which channel the last send was for and whether it worked, so the
    // result shows next to that Send button, in red when it failed.
    const [sendResult, setSendResult] = useState<{ channel: string; ok: boolean } | null>(null);

    const [newNote, setNewNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);

    async function fetchLead() {
        const res = await fetch(`/api/leads/${params.id}`);
        if (res.ok) {
            const data = await res.json();
            setLead(data.lead);
        } else {
            setNotFound(true);
        }
        setLoading(false);
    }

    async function fetchMessages() {
        const res = await fetch(`/api/leads/${params.id}/messages`);
        if (res.ok) {
            const data = await res.json();
            setMessages(data.messages || []);
        }
    }

    async function fetchNotes() {
        const res = await fetch(`/api/leads/${params.id}/notes`);
        if (res.ok) {
            const data = await res.json();
            setNotes(data.notes || []);
        }
    }

    async function fetchActivities() {
        const res = await fetch(`/api/leads/${params.id}/activity`);
        if (res.ok) {
            const data = await res.json();
            setActivities(data.activities || []);
        }
    }

    useEffect(() => {
        fetchLead();
        fetchMessages();
        fetchNotes();
        fetchActivities();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    async function handleVerifyActivity() {
        setVerifyingActivity(true);
        setActivityMessage("");
        const res = await fetch(`/api/leads/${params.id}/verify-activity`, {
            method: "POST",
        });
        const data = await res.json();
        setActivityMessage(res.ok ? `Activity score ${data.activityScore}/100 — ${data.verdict}.` : data.error);
        if (res.ok) {
            fetchLead();
            fetchActivities();
        }
        setVerifyingActivity(false);
    }

    async function handleAnalyze() {
        setAnalyzing(true);
        setAnalyzeMessage("");
        const res = await fetch(`/api/leads/${params.id}/analyze`, {
            method: "POST",
        });
        const data = await res.json();
        setAnalyzeMessage(res.ok ? "Analysis complete." : data.error);
        if (res.ok) {
            fetchLead();
            fetchActivities();
        }
        setAnalyzing(false);
    }

    async function handleEnrich() {
        setEnriching(true);
        setEnrichMessage("");
        const res = await fetch(`/api/leads/${params.id}/enrich`, {
            method: "POST",
        });
        const data = await res.json();
        setEnrichMessage(
            res.ok
                ? `Contact method: ${data.contactMethod}`
                : data.error || "Something went wrong."
        );
        if (res.ok) {
            fetchLead();
            fetchActivities();
        }
        setEnriching(false);
    }

    async function handleFindCompetitors() {
        setFindingCompetitors(true);
        setCompetitorsMessage("");
        const res = await fetch(`/api/leads/${params.id}/competitors`, {
            method: "POST",
        });
        const data = await res.json();

        if (!res.ok) {
            // A hard failure — the request itself didn't complete.
            setCompetitorsMessage(data.error || "Something went wrong.");
        } else if (data.warning) {
            // The search ran but was skipped (quota, or a search error) — this
            // used to be swallowed here, showing a false "Competitors found."
            // even though the competitors array came back empty.
            setCompetitorsMessage(data.warning);
        } else {
            const count = data.competitors?.length ?? 0;
            setCompetitorsMessage(
                count > 0
                    ? `Found ${count} competitor${count === 1 ? "" : "s"}.`
                    : "Search completed, but no real local competitors could be confirmed for this business."
            );
        }

        if (res.ok) fetchLead();
        setFindingCompetitors(false);
    }

    async function handleGenerateAudit() {
        setGeneratingAudit(true);
        setAuditMessage("");
        const res = await fetch(`/api/leads/${params.id}/audit`, {
            method: "POST",
        });
        const data = await res.json();
        setAuditMessage(res.ok ? "Audit generated." : data.error);
        if (res.ok) fetchLead();
        setGeneratingAudit(false);
    }

    async function handleGenerateDemo() {
        setGeneratingDemo(true);
        setDemoMessage("");
        const res = await fetch(`/api/leads/${params.id}/demo`, {
            method: "POST",
        });
        const data = await res.json();
        setDemoMessage(res.ok ? "Demo generated." : data.error);
        if (res.ok) fetchLead();
        setGeneratingDemo(false);
    }

    async function handleGenerateOutreach() {
        setGeneratingOutreach(true);
        setOutreachMessage("");
        const res = await fetch(`/api/leads/${params.id}/outreach`, {
            method: "POST",
        });
        const data = await res.json();

        setOutreachMessage(
            !res.ok
                ? data.error || "Something went wrong."
                : data.warning || "Outreach messages generated, with the audit and demo links included."
        );

        if (res.ok) fetchLead();
        setGeneratingOutreach(false);
    }

    async function handleSend(channel: string, content: string) {
        if (!content) return;
        setSendingChannel(channel);
        setSendMessage("");
        setSendResult(null);

        const res = await fetch(`/api/leads/${params.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel, content }),
        });
        const data = await res.json().catch(() => ({}));
        setSendResult({ channel, ok: res.ok });

        if (!res.ok) {
            setSendMessage(data.error || "Something went wrong.");
        } else {
            setSendMessage(data.message || `Message sent on ${channel}.`);
            fetchLead();
            fetchMessages();
            fetchActivities();
        }

        setSendingChannel(null);
    }

    async function handleAddNote(e: React.FormEvent) {
        e.preventDefault();
        if (!newNote.trim()) return;

        setSavingNote(true);
        const res = await fetch(`/api/leads/${params.id}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: newNote }),
        });

        if (res.ok) {
            setNewNote("");
            fetchNotes();
        }
        setSavingNote(false);
    }

    if (loading) {
        return (
            <div className="flex items-center gap-3 text-slate-400 py-12">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2DD4BF] border-t-transparent" />
                <p className="text-sm font-medium">Loading Lead Workspace...</p>
            </div>
        );
    }

    if (notFound || !lead) {
        return (
            <div className="space-y-4 rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center">
                <p className="text-sm text-slate-400">Lead account not found.</p>
                <Link href="/dashboard/leads" className="inline-block text-xs font-semibold text-[#2DD4BF] hover:underline">
                    ← Return to Leads Directory
                </Link>
            </div>
        );
    }

    const isSocialManual = lead.contactMethod === "social_manual";
    const isUnreachable = lead.contactMethod === "unreachable";

    return (
        <div className="space-y-6">
            <Link
                href="/dashboard/leads"
                className="inline-flex items-center text-xs font-semibold text-[#2DD4BF] hover:text-white transition-colors"
            >
                ← Back to Leads Directory
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#132E32] pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight text-white">{lead.companyName}</h1>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getStatusBadgeClass(lead.status)}`}>
                            {lead.status}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                        {lead.location}, {lead.market} · <span className="text-[#2DD4BF]">{lead.niche}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleVerifyActivity}
                        disabled={verifyingActivity}
                        className="rounded-lg border border-[#164E53] bg-[#0E1D1F] px-3.5 py-2 text-xs font-semibold text-[#2DD4BF] transition-all duration-200 hover:border-[#2DD4BF] disabled:opacity-40"
                    >
                        {verifyingActivity ? "Checking..." : "Verify Activity"}
                    </button>
                    <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981] disabled:opacity-50"
                    >
                        {analyzing ? "Analyzing..." : "Analyze Lead"}
                    </button>
                    <button
                        onClick={handleEnrich}
                        disabled={enriching}
                        className="rounded-lg border border-[#1E3A2B] bg-[#121C16] px-3.5 py-2 text-xs font-semibold text-[#86EFAC] transition-all duration-200 hover:border-[#4ADE80] disabled:opacity-40"
                    >
                        {enriching ? "Enriching..." : "Find Contact Info"}
                    </button>
                    <button
                        onClick={handleFindCompetitors}
                        disabled={findingCompetitors}
                        className="rounded-lg border border-[#4C1D24] bg-[#1F1015] px-3.5 py-2 text-xs font-semibold text-[#FB7185] transition-all duration-200 hover:border-[#F43F5E] disabled:opacity-40"
                    >
                        {findingCompetitors ? "Finding..." : "Find Competitors"}
                    </button>
                    <button
                        onClick={handleGenerateAudit}
                        disabled={generatingAudit}
                        className="rounded-lg border border-[#423219] bg-[#1B1710] px-3.5 py-2 text-xs font-semibold text-[#FBBF24] transition-all duration-200 hover:border-[#F59E0B] disabled:opacity-40"
                    >
                        {generatingAudit ? "Generating..." : "Generate Audit"}
                    </button>
                    <button
                        onClick={handleGenerateDemo}
                        disabled={generatingDemo}
                        className="rounded-lg border border-[#164E53] bg-[#0E1D1F] px-3.5 py-2 text-xs font-semibold text-[#2DD4BF] transition-all duration-200 hover:border-[#14B8A6] disabled:opacity-40"
                    >
                        {generatingDemo ? "Generating..." : "Generate Demo"}
                    </button>
                    <button
                        onClick={handleGenerateOutreach}
                        disabled={generatingOutreach}
                        className="rounded-lg border border-[#1E3A2B] bg-[#121C16] px-3.5 py-2 text-xs font-semibold text-[#86EFAC] transition-all duration-200 hover:border-[#4ADE80] disabled:opacity-40"
                    >
                        {generatingOutreach ? "Generating..." : "Generate Outreach"}
                    </button>
                </div>
            </div>

            {activityMessage && <div className="rounded-lg border border-[#164E53]/40 bg-[#164E53]/10 px-4 py-2.5 text-xs text-[#2DD4BF]">{activityMessage}</div>}
            {analyzeMessage && <div className="rounded-lg border border-[#D97706]/40 bg-[#D97706]/10 px-4 py-2.5 text-xs text-[#FBBF24]">{analyzeMessage}</div>}
            {enrichMessage && <div className="rounded-lg border border-[#0D9488]/40 bg-[#0D9488]/10 px-4 py-2.5 text-xs text-[#2DD4BF]">{enrichMessage}</div>}
            {competitorsMessage && <div className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-4 py-2.5 text-xs text-[#FB7185]">{competitorsMessage}</div>}
            {auditMessage && <div className="rounded-lg border border-[#B45309]/40 bg-[#B45309]/10 px-4 py-2.5 text-xs text-[#FDE68A]">{auditMessage}</div>}
            {demoMessage && <div className="rounded-lg border border-[#164E53]/40 bg-[#164E53]/10 px-4 py-2.5 text-xs text-[#2DD4BF]">{demoMessage}</div>}
            {outreachMessage && <div className="rounded-lg border border-[#1E3A2B]/40 bg-[#1E3A2B]/10 px-4 py-2.5 text-xs text-[#86EFAC]">{outreachMessage}</div>}
            {sendMessage && (
                <div
                    className={
                        sendResult && !sendResult.ok
                            ? "rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-4 py-2.5 text-xs text-[#FB7185]"
                            : "rounded-lg border border-[#059669]/40 bg-[#059669]/10 px-4 py-2.5 text-xs text-[#34D399]"
                    }
                >
                    {sendMessage}
                </div>
            )}

            {isSocialManual && (
                <div className="rounded-xl border border-[#B45309]/40 bg-[#1B1710] p-4 text-xs text-[#FDE68A]">
                    ⚠ No direct email or phone found for this business. Reach out manually via social profiles below.
                </div>
            )}
            {isUnreachable && (
                <div className="rounded-xl border border-[#9F1239]/40 bg-[#1F1015] p-4 text-xs text-[#FB7185]">
                    ✕ No email, phone, or social profiles found. Lead is unreachable.
                </div>
            )}
            {lead.optedOut && (
                <div className="rounded-xl border border-[#9F1239]/60 bg-[#1F1015] p-4 text-xs text-[#FB7185]">
                    ⛔ This lead has opted out{lead.optedOutReason ? ` (${lead.optedOutReason})` : ""}.
                    No further messages can be sent to them.
                </div>
            )}
            {lead.activityVerdict === "inactive" && (
                <div className="rounded-xl border border-[#9F1239]/60 bg-[#1F1015] p-4 text-xs text-[#FB7185]">
                    💀 This business looks like it may no longer be operating (activity score{" "}
                    {lead.activityScore}/100). The scheduled run will skip it — analyze it manually
                    here if you believe that&apos;s wrong.
                </div>
            )}

            {typeof lead.activityScore === "number" && (
                <div
                    className={`rounded-xl border p-4 shadow-lg ${lead.activityVerdict === "inactive"
                        ? "border-[#4C1D24] bg-[#1F1015]"
                        : lead.activityVerdict === "review"
                            ? "border-[#423219] bg-[#1B1710]"
                            : "border-[#1E3A2B] bg-[#121C16]"
                        }`}
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Activity Verification
                        </h2>
                        <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${lead.activityVerdict === "inactive"
                                ? "border-[#9F1239]/40 bg-[#9F1239]/10 text-[#FB7185]"
                                : lead.activityVerdict === "review"
                                    ? "border-[#B45309]/40 bg-[#B45309]/10 text-[#FBBF24]"
                                    : "border-[#059669]/40 bg-[#059669]/10 text-[#34D399]"
                                }`}
                        >
                            {lead.activityScore}/100 · {lead.activityVerdict}
                        </span>
                    </div>
                    {lead.activitySignals && lead.activitySignals.length > 0 && (
                        <ul className="mt-2.5 space-y-1 text-xs text-slate-400">
                            {lead.activitySignals.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                    <span className="mt-0.5 shrink-0">•</span>
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="mt-2.5 text-[10px] text-slate-600">
                        AI-judged from public search results, not a certainty — re-check anytime.
                    </p>
                </div>
            )}

            {/* Account Details Grid */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-lg sm:grid-cols-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Owner</p>
                    <p className="mt-1 text-sm font-semibold text-white">{lead.ownerName || "—"}</p>
                    {lead.ownerTitle && <p className="text-xs text-slate-400">{lead.ownerTitle}</p>}
                    {lead.ownerLinkedin && (
                        <a
                            href={lead.ownerLinkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#2DD4BF] hover:underline"
                        >
                            Owner&apos;s LinkedIn →
                        </a>
                    )}
                    {lead.licenseInfo && <p className="mt-1 text-xs text-slate-400">{lead.licenseInfo}</p>}
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Website</p>
                    <p className="mt-1 text-sm font-semibold text-slate-200 truncate">{lead.website || "—"}</p>
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Phone</p>
                    <p className="mt-1 text-sm font-semibold text-slate-200">{lead.phone || "—"}</p>
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Email</p>
                    <p className="mt-1 text-sm font-semibold text-slate-200 truncate">{lead.email || "—"}</p>
                </div>
                <div className="mt-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Instagram</p>
                    {lead.instagram ? (
                        <a
                            href={lead.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-sm font-semibold text-[#4ADE80] hover:underline"
                        >
                            View Profile →
                        </a>
                    ) : (
                        <p className="mt-1 text-sm text-slate-500">—</p>
                    )}
                </div>
                <div className="mt-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Facebook</p>
                    {lead.facebook ? (
                        <a
                            href={lead.facebook}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-sm font-semibold text-[#4ADE80] hover:underline"
                        >
                            View Profile →
                        </a>
                    ) : (
                        <p className="mt-1 text-sm text-slate-500">—</p>
                    )}
                </div>
                <div className="mt-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">LinkedIn</p>
                    {lead.linkedin ? (
                        <a
                            href={lead.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-sm font-semibold text-[#4ADE80] hover:underline"
                        >
                            View Profile →
                        </a>
                    ) : (
                        <p className="mt-1 text-sm text-slate-500">—</p>
                    )}
                </div>
                <div className="mt-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#FDE68A]">Growth Score</p>
                    <p className="mt-1 tabular-nums text-lg font-black text-[#FBBF24]">
                        {lead.growthScore ? `${lead.growthScore}/100` : "Not analyzed"}
                    </p>
                </div>
            </div>

            {lead.scores && (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Score Breakdown Diagnostics</h2>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <div className="rounded-lg bg-[#0E1D1F] p-3.5 border border-[#164E53]">
                            <p className="text-xs text-slate-400">Website</p>
                            <p className="tabular-nums text-lg font-bold text-[#2DD4BF] mt-1">{lead.scores.website}/100</p>
                        </div>
                        <div className="rounded-lg bg-[#121C16] p-3.5 border border-[#1E3A2B]">
                            <p className="text-xs text-slate-400">Social Media</p>
                            <p className="tabular-nums text-lg font-bold text-[#4ADE80] mt-1">{lead.scores.social}/100</p>
                        </div>
                        <div className="rounded-lg bg-[#1F1015] p-3.5 border border-[#4C1D24]">
                            <p className="text-xs text-slate-400">Lead Generation</p>
                            <p className="tabular-nums text-lg font-bold text-[#FB7185] mt-1">{lead.scores.leadGeneration}/100</p>
                        </div>
                        <div className="rounded-lg bg-[#1B1710] p-3.5 border border-[#423219]">
                            <p className="text-xs text-slate-400">Conversion</p>
                            <p className="tabular-nums text-lg font-bold text-[#FBBF24] mt-1">{lead.scores.conversion}/100</p>
                        </div>
                        <div className="rounded-lg bg-[#0E1D1F] p-3.5 border border-[#164E53]">
                            <p className="text-xs text-slate-400">SEO</p>
                            <p className="tabular-nums text-lg font-bold text-[#2DD4BF] mt-1">{lead.scores.seo}/100</p>
                        </div>
                        <div className="rounded-lg bg-[#121C16] p-3.5 border border-[#1E3A2B]">
                            <p className="text-xs text-slate-400">Branding</p>
                            <p className="tabular-nums text-lg font-bold text-[#4ADE80] mt-1">{lead.scores.branding}/100</p>
                        </div>
                    </div>
                </div>
            )}

            {lead.problems && lead.problems.length > 0 && (
                <div className="rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#070C0E] p-6 shadow-lg">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#FB7185] flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#FB7185]" />
                        Identified Bottlenecks & Friction Points
                    </h2>
                    <ul className="space-y-2 text-sm text-slate-300">
                        {lead.problems.map((problem, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-[#FB7185] font-bold">•</span>
                                <span>{problem}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {lead.recommendations && lead.recommendations.length > 0 && (
                <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-6 shadow-lg">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#4ADE80] flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                        Recommended Action Items
                    </h2>
                    <ul className="space-y-2 text-sm text-slate-300">
                        {lead.recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-[#4ADE80] font-bold">✓</span>
                                <span>{rec}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {lead.competitors && lead.competitors.length > 0 && (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Local Competitor Analysis</h2>
                    <p className="mt-1 mb-3 text-[11px] leading-relaxed text-slate-500">
                        AI-researched from public search results for this lead only —
                        directional market intel, not verified contact data. Visible only
                        here, on this lead&apos;s own page.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                        {lead.competitors.map((c, i) => (
                            <div key={i} className="rounded-lg border border-[#164E53] bg-[#0E1D1F] p-3.5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-semibold text-white">{c.name}</p>
                                    {c.score !== undefined && (
                                        <span className="shrink-0 text-xs text-[#2DD4BF]">{c.score}/100</span>
                                    )}
                                </div>
                                {c.website && (
                                    <a
                                        href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-0.5 block truncate text-xs text-[#2DD4BF] hover:underline"
                                    >
                                        {c.website}
                                    </a>
                                )}
                                <p className="mt-1.5 text-xs text-slate-300">{c.strength}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(lead.auditSlug || lead.demoUrl) && (
                <div className="rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#070C0E] p-6 shadow-lg">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#FDE68A]">Prospect-Facing Assets</h2>
                    <div className="space-y-3 text-sm">
                        {lead.auditSlug && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#423219] bg-[#091215] p-3">
                                <span className="font-mono text-xs text-[#FBBF24]">/audit/{lead.auditSlug}</span>
                                <CopyButton text={`/audit/${lead.auditSlug}`} />
                            </div>
                        )}
                        {lead.demoUrl && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#423219] bg-[#091215] p-3">
                                <span className="font-mono text-xs text-[#FBBF24] truncate">{lead.demoUrl}</span>
                                <CopyButton text={lead.demoUrl} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {lead.outreachMessages && (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Draft Outreach Messages</h2>
                    <div className="space-y-4 text-sm">
                        {CHANNELS.map(({ key, label }) => {
                            const content =
                                lead.outreachMessages?.[key as keyof OutreachMessages];
                            const isManualChannel = ["instagram", "facebook", "linkedin"].includes(key);
                            return (
                                <div key={key} className="rounded-lg border border-[#164E53] bg-[#0E1D1F] p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="font-bold text-[#2DD4BF] text-xs uppercase tracking-wider">{label}</p>
                                        <div className="flex items-center gap-2">
                                            <CopyButton text={content || ""} />
                                            {!isManualChannel && (
                                                <button
                                                    onClick={() => handleSend(key, content || "")}
                                                    disabled={!content || sendingChannel === key || lead.optedOut}
                                                    className="rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#14B8A6] disabled:opacity-40"
                                                >
                                                    {sendingChannel === key ? "Sending..." : "Send"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-slate-200 leading-relaxed text-xs font-mono bg-[#070C0E] p-3 rounded-md border border-[#132E32]">
                                        {content || "Not generated yet."}
                                    </p>
                                    {sendResult?.channel === key && sendMessage && (
                                        <p
                                            role="status"
                                            className={`mt-2 rounded-md px-3 py-2 text-xs font-semibold ${
                                                sendResult.ok
                                                    ? "bg-[#059669]/10 text-[#34D399]"
                                                    : "bg-[#9F1239]/10 text-[#FB7185]"
                                            }`}
                                        >
                                            {sendResult.ok ? "✓ " : "✕ Not sent: "}
                                            {sendMessage}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Communication History</h2>
                    {messages.length === 0 ? (
                        <p className="text-xs text-slate-500">No messages logged yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {messages.map((m) => (
                                <div key={m._id} className="rounded-lg border border-[#164E53] bg-[#0E1D1F] p-3 text-xs">
                                    <div className="flex items-center justify-between text-slate-400 mb-1">
                                        <span className="font-bold text-[#2DD4BF] uppercase">{m.channel} · {m.direction}</span>
                                        <span>{new Date(m.sentAt).toLocaleString()}</span>
                                    </div>
                                    <p className="text-slate-200">{m.content}</p>
                                    {m.channel === "email" && m.direction === "outbound" && (
                                        <p
                                            className={`mt-2 text-[11px] font-semibold ${m.openCount ? "text-[#34D399]" : "text-slate-500"}`}
                                            title="Opens are approximate: some email apps block images, and Apple Mail can open them automatically."
                                        >
                                            {m.openCount
                                                ? `👁 Opened ${m.openCount}× · last ${new Date(m.lastOpenedAt || m.firstOpenedAt || m.sentAt).toLocaleString()}`
                                                : "Not opened yet"}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-[#1E3A2B] bg-[#121C16] p-6 shadow-lg">
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#4ADE80]">System Activity Stream</h2>
                    {activities.length === 0 ? (
                        <p className="text-xs text-slate-500">No activity recorded yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {activities.map((a) => (
                                <div key={a._id} className="flex items-center justify-between text-xs py-1.5 border-b border-[#1E3A2B] last:border-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[#4ADE80] font-bold">✓</span>
                                        <span className="text-slate-200">{a.description}</span>
                                    </div>
                                    <span className="text-slate-500 text-[10px] shrink-0">
                                        {new Date(a.createdAt).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Internal Notes</h2>
                <form onSubmit={handleAddNote} className="mb-4 flex gap-2">
                    <input
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add internal note..."
                        className="flex-1 rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={savingNote}
                        className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#14B8A6] disabled:opacity-40"
                    >
                        {savingNote ? "Saving..." : "Add Note"}
                    </button>
                </form>
                {notes.length === 0 ? (
                    <p className="text-xs text-slate-500">No notes recorded yet.</p>
                ) : (
                    <div className="space-y-2">
                        {notes.map((n) => (
                            <div key={n._id} className="rounded-lg border border-[#164E53] bg-[#0E1D1F] p-3 text-xs">
                                <p className="text-slate-200">{n.content}</p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                    {new Date(n.createdAt).toLocaleString()}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}