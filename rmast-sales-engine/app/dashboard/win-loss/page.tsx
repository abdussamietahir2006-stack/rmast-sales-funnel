"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Lead {
    _id: string;
    companyName: string;
    status: string;
    winLossReason?: string;
    closedAt?: string;
}

function Column({
    title,
    leads,
    accent,
    border,
    emptyText,
}: {
    title: string;
    leads: Lead[];
    accent: string;
    border: string;
    emptyText: string;
}) {
    return (
        <div>
            <h2 className={`mb-3 text-xs font-bold uppercase tracking-wider ${accent}`}>
                {title} ({leads.length})
            </h2>
            {leads.length === 0 ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-xs text-slate-500">
                    {emptyText}
                </div>
            ) : (
                <div className="space-y-2.5">
                    {leads.map((lead) => (
                        <Link
                            key={lead._id}
                            href={`/dashboard/leads/${lead._id}`}
                            className={`block rounded-xl border ${border} bg-[#091215] p-4 transition-colors hover:border-[#2DD4BF]/40`}
                        >
                            <p className="text-sm font-semibold text-white">{lead.companyName}</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-400">
                                {lead.winLossReason || "No reason logged."}
                            </p>
                            {lead.closedAt && (
                                <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-600">
                                    {new Date(lead.closedAt).toLocaleDateString()}
                                </p>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function WinLossPage() {
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

    const won = leads.filter((l) => l.status === "Won");
    const lost = leads.filter((l) => l.status === "Lost");
    const closed = won.length + lost.length;
    const winRate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Win / Loss Reasons</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Why deals closed, so the same objection doesn&apos;t keep costing you.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-sm text-slate-400">
                    Loading closed deals…
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-5 shadow-lg">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Won</p>
                            <p className="mt-2 tabular-nums text-3xl font-black text-white">{won.length}</p>
                        </div>
                        <div className="rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#070C0E] p-5 shadow-lg">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">Lost</p>
                            <p className="mt-2 tabular-nums text-3xl font-black text-white">{lost.length}</p>
                        </div>
                        <div className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-5 shadow-lg">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Win Rate</p>
                            <p className="mt-2 tabular-nums text-3xl font-black text-white">{winRate}%</p>
                        </div>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2">
                        <Column
                            title="Won"
                            leads={won}
                            accent="text-[#4ADE80]"
                            border="border-[#1E3A2B]"
                            emptyText="No wins yet."
                        />
                        <Column
                            title="Lost"
                            leads={lost}
                            accent="text-[#FB7185]"
                            border="border-[#4C1D24]"
                            emptyText="No losses yet."
                        />
                    </div>
                </>
            )}
        </div>
    );
}
