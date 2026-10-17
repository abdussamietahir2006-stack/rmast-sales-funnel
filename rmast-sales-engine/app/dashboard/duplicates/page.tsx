"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
    market: string;
    location: string;
    website?: string;
    status: string;
    createdAt: string;
}

export default function DuplicatesPage() {
    const [groups, setGroups] = useState<Lead[][]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    async function fetchDuplicates() {
        setLoading(true);
        const res = await fetch("/api/leads/duplicates");
        const data = await res.json();
        setGroups(data.duplicateGroups || []);
        setLoading(false);
    }

    useEffect(() => {
        fetchDuplicates();
    }, []);

    async function handleDelete(id: string, companyName: string) {
        const confirmed = window.confirm(`Delete duplicate "${companyName}"?`);
        if (!confirmed) return;

        setDeletingId(id);
        await fetch(`/api/leads/${id}`, { method: "DELETE" });
        setDeletingId(null);
        fetchDuplicates();
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Duplicate Leads</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Accounts sharing identical name and market criteria — review and resolve entries.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#1E293B] bg-[#131720] p-6 text-center text-slate-400 animate-pulse">
                    Scanning database for duplicates...
                </div>
            ) : groups.length === 0 ? (
                <div className="rounded-xl border border-[#1E293B] bg-[#131720] p-8 text-center text-slate-400">
                    ✓ Clean database — zero duplicate records detected.
                </div>
            ) : (
                <div className="space-y-4">
                    {groups.map((group, i) => (
                        <div key={i} className="rounded-xl border border-[#1E293B] bg-[#131720] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
                            <p className="mb-3 text-sm font-bold text-white flex items-center justify-between">
                                <span>{group[0].companyName}</span>
                                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
                                    {group.length} Duplicate Entries
                                </span>
                            </p>
                            <div className="space-y-2">
                                {group.map((lead) => (
                                    <div
                                        key={lead._id}
                                        className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#0D1117] p-3 text-xs"
                                    >
                                        <div>
                                            <p className="font-medium text-slate-200">
                                                {lead.location}, {lead.market} · <span className="text-slate-400">{lead.website || "no website"}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                Added {new Date(lead.createdAt).toLocaleDateString()} · Status: <span className="text-slate-400">{lead.status}</span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(lead._id, lead.companyName)}
                                            disabled={deletingId === lead._id}
                                            className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-all duration-200 hover:bg-red-500/10 disabled:opacity-40"
                                        >
                                            {deletingId === lead._id ? "Deleting..." : "Delete"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}