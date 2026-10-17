"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
}

interface CallNoteWithLead {
    _id: string;
    leadId: string;
    companyName: string;
    notes: string;
    summary?: string;
    nextSteps?: string;
    createdAt: string;
}

export default function CallNotesPage() {
    const [callNotes, setCallNotes] = useState<CallNoteWithLead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAll() {
            const leadsRes = await fetch("/api/leads");
            const leadsData = await leadsRes.json();
            const leads: Lead[] = leadsData.leads || [];

            const results = await Promise.all(
                leads.map(async (lead) => {
                    const res = await fetch(`/api/leads/${lead._id}/call-notes`);
                    const data = await res.json();
                    return data.notes || [];
                })
            );

            const all = results
                .flat()
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

            setCallNotes(all);
            setLoading(false);
        }
        fetchAll();
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Call Notes History</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Consolidated meeting summaries and follow-up action items across every lead.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Loading meeting notes...
                </div>
            ) : callNotes.length === 0 ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center text-slate-400">
                    No call notes logged yet. Add call notes directly from any lead account page after a call.
                </div>
            ) : (
                <div className="space-y-4">
                    {callNotes.map((c) => (
                        <div
                            key={c._id}
                            className="cursor-pointer rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-5 text-xs shadow-lg transition-all duration-200 hover:border-[#2DD4BF]/50 hover:scale-[1.005]"
                            onClick={() =>
                                (window.location.href = `/dashboard/leads/${c.leadId}`)
                            }
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-white text-sm hover:text-[#2DD4BF]">{c.companyName}</h3>
                                <span className="font-mono text-[10px] text-slate-400">
                                    {new Date(c.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-slate-300 leading-relaxed font-mono bg-[#070C0E] p-3 rounded-lg border border-[#132E32]">
                                {c.notes}
                            </p>
                            {c.summary && (
                                <p className="mt-2 text-xs text-[#2DD4BF]">
                                    <span className="font-bold uppercase tracking-wider text-slate-400 mr-1">Summary:</span> {c.summary}
                                </p>
                            )}
                            {c.nextSteps && (
                                <p className="mt-1 text-xs text-[#4ADE80]">
                                    <span className="font-bold uppercase tracking-wider text-slate-400 mr-1">Next Step:</span> {c.nextSteps}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}