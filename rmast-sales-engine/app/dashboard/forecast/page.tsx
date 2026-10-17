"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    status: string;
}

// Rough historical close-rate assumptions per stage — refine over time
// as real data accumulates.
const STAGE_WEIGHTS: Record<string, number> = {
    New: 0.02,
    Analyzing: 0.03,
    Analyzed: 0.05,
    Contacted: 0.08,
    Replied: 0.15,
    Qualified: 0.35,
    Won: 1,
    Lost: 0,
};

const DEFAULT_DEAL_VALUE = 3000;
const STORAGE_KEY = "rmast.forecast.dealValue";

export default function ForecastPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [dealValue, setDealValue] = useState(DEFAULT_DEAL_VALUE);

    useEffect(() => {
        async function load() {
            // The deal value is remembered per browser so the figure doesn't
            // have to be edited in code every time the average changes.
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) setDealValue(Number(stored) || DEFAULT_DEAL_VALUE);
            } catch {
                // Private browsing or blocked storage — the default is fine.
            }

            const res = await fetch("/api/leads");
            const data = await res.json();
            setLeads(data.leads || []);
            setLoading(false);
        }
        load();
    }, []);

    function handleDealValueChange(next: number) {
        setDealValue(next);
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // Non-essential.
        }
    }

    const stageCounts: Record<string, number> = {};
    let forecastedValue = 0;

    for (const lead of leads) {
        stageCounts[lead.status] = (stageCounts[lead.status] || 0) + 1;
        forecastedValue += (STAGE_WEIGHTS[lead.status] ?? 0) * dealValue;
    }

    const wonCount = stageCounts["Won"] || 0;
    const openCount = leads.length - wonCount - (stageCounts["Lost"] || 0);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Pipeline Forecast</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Each open stage is weighted by its historical close rate and multiplied
                    by your average deal value.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#132E32] bg-[#091215] p-5 shadow-lg">
                <div>
                    <label
                        htmlFor="deal-value"
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]"
                    >
                        Average Deal Value (USD)
                    </label>
                    <input
                        id="deal-value"
                        type="number"
                        min={0}
                        step={100}
                        value={dealValue}
                        onChange={(e) => handleDealValueChange(Number(e.target.value))}
                        className="w-44 rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm tabular-nums text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <p className="pb-2.5 text-xs text-slate-500">
                    Saved in this browser.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-sm text-slate-400">
                    Loading pipeline…
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-5 shadow-lg">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                Weighted Pipeline Value
                            </p>
                            <p className="mt-2 tabular-nums text-3xl font-black text-white">
                                ${Math.round(forecastedValue).toLocaleString()}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                                {openCount} open lead{openCount === 1 ? "" : "s"}
                            </p>
                        </div>

                        <div className="rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#070C0E] p-5 shadow-lg">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#FDE68A]">
                                Confirmed Won Value
                            </p>
                            <p className="mt-2 tabular-nums text-3xl font-black text-white">
                                ${(wonCount * dealValue).toLocaleString()}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                                {wonCount} closed deal{wonCount === 1 ? "" : "s"}
                            </p>
                        </div>

                        <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-5 shadow-lg">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">
                                Total Leads
                            </p>
                            <p className="mt-2 tabular-nums text-3xl font-black text-white">
                                {leads.length.toLocaleString()}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">Across every stage</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            Leads by Stage
                        </h2>
                        <div className="space-y-3">
                            {Object.entries(STAGE_WEIGHTS).map(([stage, weight]) => {
                                const count = stageCounts[stage] || 0;
                                const percent = leads.length
                                    ? Math.round((count / leads.length) * 100)
                                    : 0;
                                return (
                                    <div key={stage} className="flex items-center gap-4">
                                        <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-300">
                                            {stage}
                                        </span>
                                        <div className="h-3 flex-1 overflow-hidden rounded-full border border-[#132E32] bg-[#070C0E]">
                                            <div
                                                className="h-full bg-gradient-to-r from-[#0D9488] to-[#059669] transition-all duration-500"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                        <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-slate-400">
                                            <span className="font-bold text-slate-100">{count}</span>
                                            {" · "}
                                            {Math.round(weight * 100)}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="mt-4 border-t border-[#132E32] pt-4 text-xs text-slate-500">
                            The trailing percentage is the assumed close rate for that stage.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
