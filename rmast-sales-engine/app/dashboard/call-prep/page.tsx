"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
    growthScore?: number;
}

interface CallPrep {
    companyName: string;
    growthScore: number | null;
    topProblems: string[];
    recommendations: string[];
    competitors: { name: string; strength: string }[];
    talkingPoints: string[] | null;
    objections: { objection: string; response: string }[] | null;
    warning?: string;
}

export default function CallPrepPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [prep, setPrep] = useState<CallPrep | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingPrep, setLoadingPrep] = useState(false);

    useEffect(() => {
        async function fetchLeads() {
            const res = await fetch("/api/leads");
            const data = await res.json();
            setLeads(data.leads || []);
            setLoading(false);
        }
        fetchLeads();
    }, []);

    async function handleSelect(id: string) {
        setSelectedId(id);
        setPrep(null);
        if (!id) return;

        setLoadingPrep(true);
        const res = await fetch(`/api/leads/${id}/call-prep`);
        const data = await res.json();
        if (res.ok) setPrep(data.prep);
        setLoadingPrep(false);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Call Prep Briefing</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Select a lead account below for an automated pre-call briefing & talking points.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Loading accounts directory...
                </div>
            ) : (
                <div className="max-w-md space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                        Select Lead Account
                    </label>
                    <select
                        value={selectedId}
                        onChange={(e) => handleSelect(e.target.value)}
                        className="w-full rounded-xl border border-[#164E53] bg-[#070C0E] px-4 py-3 text-sm font-semibold text-white shadow-lg focus:border-[#2DD4BF] focus:outline-none focus:ring-1 focus:ring-[#2DD4BF] transition-all cursor-pointer"
                    >
                        <option value="" className="bg-[#070C0E] text-slate-400">
                            -- Select a lead account --
                        </option>
                        {leads.map((l) => (
                            <option key={l._id} value={l._id} className="bg-[#091215] text-white">
                                {l.companyName} {l.growthScore ? `(Score: ${l.growthScore}/100)` : ""}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {loadingPrep && (
                <div className="flex items-center gap-3 text-[#2DD4BF] py-6">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2DD4BF] border-t-transparent" />
                    <p className="text-sm font-semibold">Generating Pre-Call Intelligence Brief...</p>
                </div>
            )}

            {prep && (
                <div className="max-w-2xl space-y-5">
                    {/* Account Overview Header */}
                    <div className="relative overflow-hidden rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-xl">
                        <div className="absolute top-0 right-0 h-24 w-24 bg-[#0D9488]/10 rounded-full blur-xl pointer-events-none" />
                        <h2 className="text-xl font-extrabold text-white">{prep.companyName}</h2>
                        <p className="mt-1.5 text-xs font-semibold text-[#2DD4BF]">
                            Growth Diagnostics Score:{" "}
                            <span className="tabular-nums text-sm font-bold text-white">
                                {prep.growthScore !== null ? `${prep.growthScore}/100` : "Not analyzed yet"}
                            </span>
                        </p>
                    </div>

                    {/* AI Talking Points */}
                    {prep.talkingPoints && prep.talkingPoints.length > 0 && (
                        <div className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-xl">
                            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                <span className="h-2 w-2 rounded-full bg-[#2DD4BF]" />
                                Talking Points
                            </h3>
                            <ol className="space-y-2.5 text-sm text-slate-300">
                                {prep.talkingPoints.map((point, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <span className="mt-0.5 shrink-0 font-bold tabular-nums text-[#2DD4BF]">
                                            {i + 1}.
                                        </span>
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Likely Objections */}
                    {prep.objections && prep.objections.length > 0 && (
                        <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-xl">
                            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                                <span className="h-2 w-2 rounded-full bg-slate-500" />
                                Likely Objections
                            </h3>
                            <div className="space-y-3">
                                {prep.objections.map((item, i) => (
                                    <div
                                        key={i}
                                        className="rounded-lg border border-[#132E32] bg-[#070C0E] p-3.5"
                                    >
                                        <p className="text-sm font-semibold text-slate-100">
                                            &ldquo;{item.objection}&rdquo;
                                        </p>
                                        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                                            {item.response}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {prep.warning && (
                        <div className="rounded-xl border border-[#B45309]/40 bg-[#1B1710] p-4 text-xs text-[#FDE68A]">
                            {prep.warning}
                        </div>
                    )}

                    {/* Top Problems Identified */}
                    {prep.topProblems.length > 0 && (
                        <div className="rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#070C0E] p-6 shadow-xl">
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#FB7185] flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-[#FB7185]" />
                                Key Pain Points & Bottlenecks
                            </h3>
                            <ul className="space-y-2 text-sm text-slate-300">
                                {prep.topProblems.map((p, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <span className="text-[#FB7185] font-bold shrink-0 mt-0.5">•</span>
                                        <span>{p}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Suggested Solutions */}
                    {prep.recommendations.length > 0 && (
                        <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-6 shadow-xl">
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#4ADE80] flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                                Recommended Value Pitch & Fixes
                            </h3>
                            <ul className="space-y-2 text-sm text-slate-300">
                                {prep.recommendations.map((r, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <span className="text-[#4ADE80] font-bold shrink-0 mt-0.5">✓</span>
                                        <span>{r}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Competitor Talking Points */}
                    {prep.competitors.length > 0 && (
                        <div className="rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#070C0E] p-6 shadow-xl">
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#FDE68A] flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-[#FBBF24]" />
                                Local Competitor Intel
                            </h3>
                            <ul className="space-y-2 text-sm text-slate-300">
                                {prep.competitors.map((c, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <span className="text-[#FBBF24] font-bold shrink-0 mt-0.5">❖</span>
                                        <span>
                                            <strong className="text-white font-semibold">{c.name}</strong>: {c.strength}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {!prep.growthScore && (
                        <div className="rounded-xl border border-[#132E32] bg-[#091215] p-4 text-xs text-slate-400">
                            💡 Tip: Run AI analysis on this lead from its account page for more detailed talking points.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}