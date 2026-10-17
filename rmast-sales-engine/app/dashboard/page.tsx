"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
    totalLeads: number;
    outreachSent: number;
    repliesReceived: number;
    dealsWon: number;
    dealsLost: number;
    appointmentsUpcoming: number;
    averageGrowthScore: number;
    replyRate: number;
    winRate: number;
    byStatus: Record<string, number>;
}

const PIPELINE_STAGES = [
    "New",
    "Analyzing",
    "Analyzed",
    "Contacted",
    "Replied",
    "Qualified",
    "Won",
    "Lost",
];

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch("/api/stats");
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                } else {
                    setError("Could not load dashboard metrics.");
                }
            } catch {
                setError("Could not reach the server.");
            }
            setLoading(false);
        }
        fetchStats();
    }, []);

    const value = (n: number | undefined) =>
        loading ? "—" : (n ?? 0).toLocaleString();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h1>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    High-level metrics and multi-channel performance highlights across your sales pipeline.
                </p>
            </div>

            {error && (
                <div className="rounded-xl border border-[#9F1239]/40 bg-[#9F1239]/10 px-4 py-3 text-xs text-[#FB7185]">
                    {error}
                </div>
            )}

            {/* Rich Multi-Jewel Tone Metric Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Teal Jewel Card */}
                <div className="relative overflow-hidden rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#0A1618] p-6 shadow-lg transition-all duration-200 hover:border-[#2DD4BF]/50 hover:scale-[1.005]">
                    <div className="absolute top-0 right-0 h-24 w-24 bg-[#0D9488]/10 rounded-full blur-xl pointer-events-none" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Total Leads</p>
                    <p className="mt-2 tabular-nums text-3xl font-black tracking-tight text-white">
                        {value(stats?.totalLeads)}
                    </p>
                    <span className="mt-3 inline-block rounded-full bg-[#0D9488]/20 px-2.5 py-0.5 text-xs font-semibold text-[#2DD4BF] border border-[#0D9488]/40">
                        {value(stats?.byStatus?.New)} awaiting analysis
                    </span>
                </div>

                {/* Olive Green Jewel Card */}
                <div className="relative overflow-hidden rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#0B130E] p-6 shadow-lg transition-all duration-200 hover:border-[#4ADE80]/50 hover:scale-[1.005]">
                    <div className="absolute top-0 right-0 h-24 w-24 bg-[#15803D]/10 rounded-full blur-xl pointer-events-none" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Outreach Sent</p>
                    <p className="mt-2 tabular-nums text-3xl font-black tracking-tight text-white">
                        {value(stats?.outreachSent)}
                    </p>
                    <span className="mt-3 inline-block rounded-full bg-[#15803D]/20 px-2.5 py-0.5 text-xs font-semibold text-[#4ADE80] border border-[#15803D]/40">
                        {value(stats?.repliesReceived)} replies · {stats?.replyRate ?? 0}%
                    </span>
                </div>

                {/* Maroon / Burgundy Jewel Card */}
                <div className="relative overflow-hidden rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#150A0E] p-6 shadow-lg transition-all duration-200 hover:border-[#FB7185]/50 hover:scale-[1.005]">
                    <div className="absolute top-0 right-0 h-24 w-24 bg-[#9F1239]/10 rounded-full blur-xl pointer-events-none" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">Avg Growth Score</p>
                    <p className="mt-2 tabular-nums text-3xl font-black tracking-tight text-white">
                        {value(stats?.averageGrowthScore)}
                        <span className="text-sm font-semibold text-rose-300/60">/100</span>
                    </p>
                    <span className="mt-3 inline-block rounded-full bg-[#9F1239]/20 px-2.5 py-0.5 text-xs font-semibold text-[#FB7185] border border-[#9F1239]/40">
                        Across analyzed leads
                    </span>
                </div>

                {/* Warm Gold / Copper Jewel Card */}
                <div className="relative overflow-hidden rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#120E0A] p-6 shadow-lg transition-all duration-200 hover:border-[#FBBF24]/50 hover:scale-[1.005]">
                    <div className="absolute top-0 right-0 h-24 w-24 bg-[#B45309]/10 rounded-full blur-xl pointer-events-none" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#FDE68A]">Deals Won</p>
                    <p className="mt-2 tabular-nums text-3xl font-black tracking-tight text-white">
                        {value(stats?.dealsWon)}
                    </p>
                    <span className="mt-3 inline-block rounded-full bg-[#B45309]/20 px-2.5 py-0.5 text-xs font-semibold text-[#FBBF24] border border-[#B45309]/40">
                        {stats?.winRate ?? 0}% win rate
                    </span>
                </div>
            </div>

            {/* Pipeline distribution */}
            <div className="rounded-xl border border-[#132E32] bg-gradient-to-br from-[#091417] via-[#0B1714] to-[#150A10] p-8 shadow-xl">
                <div className="mb-5 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-[#2DD4BF] shadow-[0_0_10px_#2DD4BF]" />
                    <span className="h-3 w-3 rounded-full bg-[#4ADE80] shadow-[0_0_10px_#4ADE80]" />
                    <span className="h-3 w-3 rounded-full bg-[#FB7185] shadow-[0_0_10px_#FB7185]" />
                    <h2 className="ml-2 text-lg font-bold tracking-tight text-white">Pipeline Distribution</h2>
                </div>

                {loading ? (
                    <p className="text-sm text-slate-400">Loading pipeline…</p>
                ) : stats && stats.totalLeads > 0 ? (
                    <div className="space-y-2.5">
                        {PIPELINE_STAGES.map((stage) => {
                            const count = stats.byStatus?.[stage] || 0;
                            const percent = Math.round((count / stats.totalLeads) * 100);
                            return (
                                <div key={stage} className="flex items-center gap-4">
                                    <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                        {stage}
                                    </span>
                                    <div className="h-3 flex-1 overflow-hidden rounded-full border border-[#132E32] bg-[#070C0E]">
                                        <div
                                            className="h-full bg-gradient-to-r from-[#0D9488] to-[#059669] transition-all duration-500"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                    <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-slate-300">
                                        {count}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm leading-relaxed text-slate-300">
                        No leads yet. Add one from the{" "}
                        <Link href="/dashboard/leads" className="text-[#2DD4BF] hover:underline">
                            Leads
                        </Link>{" "}
                        page, or set up a{" "}
                        <Link href="/dashboard/campaigns" className="text-[#2DD4BF] hover:underline">
                            campaign
                        </Link>{" "}
                        to have the engine discover them for you.
                    </p>
                )}

                {!loading && stats && (
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[#132E32] pt-5 sm:grid-cols-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Upcoming Calls</p>
                            <p className="mt-1 tabular-nums text-lg font-bold text-[#FBBF24]">
                                {stats.appointmentsUpcoming}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Replies</p>
                            <p className="mt-1 tabular-nums text-lg font-bold text-[#4ADE80]">
                                {stats.repliesReceived}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Lost</p>
                            <p className="mt-1 tabular-nums text-lg font-bold text-[#FB7185]">
                                {stats.dealsLost}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reply Rate</p>
                            <p className="mt-1 tabular-nums text-lg font-bold text-[#2DD4BF]">
                                {stats.replyRate}%
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
