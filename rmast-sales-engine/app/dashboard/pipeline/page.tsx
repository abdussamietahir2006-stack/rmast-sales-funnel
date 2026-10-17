"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
    niche: string;
    market: string;
    location: string;
    status: string;
    growthScore?: number;
}

const STAGES = [
    "New",
    "Analyzing",
    "Analyzed",
    "Contacted",
    "Replied",
    "Qualified",
    "Won",
    "Lost",
];

export default function PipelinePage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [movingId, setMovingId] = useState<string | null>(null);

    async function fetchLeads() {
        setLoading(true);
        const res = await fetch("/api/leads");
        const data = await res.json();
        setLeads(data.leads || []);
        setLoading(false);
    }

    useEffect(() => {
        fetchLeads();
    }, []);

    async function moveLead(id: string, newStatus: string) {
        let reason = "";

        if (newStatus === "Won" || newStatus === "Lost") {
            const input = window.prompt(
                `Why was this lead marked as ${newStatus}? (optional)`
            );
            reason = input || "";
        }

        setMovingId(id);
        // PATCH /api/leads/[id] — the old /status route did the same job but
        // silently dropped the win/loss reason this page collects above.
        await fetch(`/api/leads/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, reason }),
        });
        setMovingId(null);
        fetchLeads();
    }

    if (loading) {
        return (
            <div className="flex items-center gap-3 text-slate-400 py-12">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2DD4BF] border-t-transparent" />
                <p className="text-sm font-medium">Loading Sales Pipeline...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Visual Sales Pipeline</h1>
                <p className="mt-1 text-sm text-slate-400">
                    <span className="font-mono text-[#2DD4BF] font-semibold">{leads.length}</span> total lead accounts across your conversion funnel.
                </p>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-6">
                {STAGES.map((stage) => {
                    const stageLeads = leads.filter((l) => l.status === stage);
                    return (
                        <div
                            key={stage}
                            className="w-72 shrink-0 rounded-xl border border-[#132E32] bg-[#091215] p-4 shadow-xl flex flex-col justify-between"
                        >
                            <div>
                                <div className="mb-4 flex items-center justify-between border-b border-[#132E32] pb-3">
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF] flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#2DD4BF]" />
                                        {stage}
                                    </h2>
                                    <span className="rounded-full bg-[#0D9488]/20 px-2.5 py-0.5 text-xs font-bold text-[#2DD4BF] border border-[#0D9488]/40">
                                        {stageLeads.length}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {stageLeads.length === 0 && (
                                        <p className="text-xs text-slate-500 italic py-2 text-center">No accounts in this stage.</p>
                                    )}
                                    {stageLeads.map((lead) => {
                                        const currentIndex = STAGES.indexOf(lead.status);
                                        const prevStage = STAGES[currentIndex - 1];
                                        const nextStage = STAGES[currentIndex + 1];

                                        return (
                                            <div
                                                key={lead._id}
                                                className="rounded-lg border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-3.5 shadow-md transition-all duration-200 hover:border-[#2DD4BF]/60"
                                            >
                                                <p
                                                    className="cursor-pointer font-bold text-white text-sm hover:text-[#2DD4BF] transition-colors"
                                                    onClick={() =>
                                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                                    }
                                                >
                                                    {lead.companyName}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-300">
                                                    {lead.location}, <span className="text-slate-400">{lead.market}</span>
                                                </p>
                                                {lead.growthScore !== undefined &&
                                                    lead.growthScore !== null && (
                                                        <p className="mt-1.5 text-xs font-semibold text-[#FBBF24]">
                                                            Growth Score: <span className="tabular-nums font-bold text-white">{lead.growthScore}/100</span>
                                                        </p>
                                                    )}
                                                <div className="mt-3 flex justify-between gap-1.5 pt-2 border-t border-[#132E32]">
                                                    <button
                                                        disabled={!prevStage || movingId === lead._id}
                                                        onClick={() =>
                                                            prevStage && moveLead(lead._id, prevStage)
                                                        }
                                                        className="flex-1 rounded-md border border-[#132E32] bg-[#070C0E] px-2 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-[#0D9488]/20 hover:text-[#2DD4BF] hover:border-[#0D9488]/40 disabled:opacity-20"
                                                    >
                                                        ← Back
                                                    </button>
                                                    <button
                                                        disabled={!nextStage || movingId === lead._id}
                                                        onClick={() =>
                                                            nextStage && moveLead(lead._id, nextStage)
                                                        }
                                                        className="flex-1 rounded-md border border-[#132E32] bg-[#070C0E] px-2 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-[#0D9488]/20 hover:text-[#2DD4BF] hover:border-[#0D9488]/40 disabled:opacity-20"
                                                    >
                                                        Next →
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}