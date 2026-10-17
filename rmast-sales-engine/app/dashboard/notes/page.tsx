"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
}

interface NoteWithLead {
    _id: string;
    leadId: string;
    content: string;
    createdAt: string;
    companyName: string;
}

export default function NotesPage() {
    const [notes, setNotes] = useState<NoteWithLead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAll() {
            const leadsRes = await fetch("/api/leads");
            const leadsData = await leadsRes.json();
            const leads: Lead[] = leadsData.leads || [];

            const noteResults = await Promise.all(
                leads.map(async (lead) => {
                    const res = await fetch(`/api/leads/${lead._id}/notes`);
                    const data = await res.json();
                    return (data.notes || []).map((n: { _id: string; content: string; createdAt: string }) => ({
                        ...n,
                        leadId: lead._id,
                        companyName: lead.companyName,
                    }));
                })
            );

            const allNotes = noteResults.flat().sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setNotes(allNotes);
            setLoading(false);
        }
        fetchAll();
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Notes & Tags</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Consolidated internal notes across all client accounts.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Loading internal notes...
                </div>
            ) : notes.length === 0 ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center text-slate-400">
                    No notes recorded yet. Add notes directly from any lead account page.
                </div>
            ) : (
                <div className="space-y-3">
                    {notes.map((n) => (
                        <div
                            key={n._id}
                            className="cursor-pointer rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-4 text-xs shadow-md transition-all duration-200 hover:border-[#2DD4BF]/50 hover:scale-[1.005]"
                            onClick={() =>
                                (window.location.href = `/dashboard/leads/${n.leadId}`)
                            }
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="font-bold text-white text-sm hover:text-[#2DD4BF]">{n.companyName}</p>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {new Date(n.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-slate-300 leading-relaxed">{n.content}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}