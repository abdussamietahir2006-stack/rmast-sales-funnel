"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    niche: string;
    market: string;
    status: string;
}

export default function SourceRoiPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchLeads() {
            const res = await fetch("/api/leads");
            const data = await res.json();
            setLeads(data.leads || []);
            setLoading(false);
        }
        fetchLeads();
    }, []);

    // Group by niche + market combination
    const groups: Record<
        string,
        { total: number; won: number; niche: string; market: string }
    > = {};

    for (const lead of leads) {
        const key = `${lead.niche} · ${lead.market}`;
        if (!groups[key]) {
            groups[key] = { total: 0, won: 0, niche: lead.niche, market: lead.market };
        }
        groups[key].total += 1;
        if (lead.status === "Won") groups[key].won += 1;
    }

    const rows = Object.entries(groups).sort((a, b) => b[1].total - a[1].total);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Lead Source ROI</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Which niche/market combinations are actually converting to signed clients.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Calculating lead source performance metrics...
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center text-slate-400">
                    No lead accounts recorded yet.
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-[#132E32] bg-[#091215] shadow-xl">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-[#132E32] bg-[#070C0E] text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                <th className="px-5 py-3.5">Niche · Market</th>
                                <th className="px-5 py-3.5">Total Leads</th>
                                <th className="px-5 py-3.5">Deals Won</th>
                                <th className="px-5 py-3.5">Conversion Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#132E32]/60">
                            {rows.map(([key, data]) => {
                                const rate = ((data.won / data.total) * 100).toFixed(1);
                                return (
                                    <tr key={key} className="transition-colors hover:bg-white/[0.03]">
                                        <td className="px-5 py-3.5 font-bold text-white">{key}</td>
                                        <td className="px-5 py-3.5 text-slate-300 tabular-nums">{data.total}</td>
                                        <td className="px-5 py-3.5 text-[#34D399] font-bold tabular-nums">{data.won}</td>
                                        <td className="px-5 py-3.5 font-mono text-xs">
                                            <span className="rounded-full bg-[#059669]/20 px-2.5 py-0.5 text-xs font-bold text-[#34D399] border border-[#059669]/40">
                                                {rate}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}