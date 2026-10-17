"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
}

interface ActivityWithLead {
    _id: string;
    leadId: string;
    type: string;
    description: string;
    createdAt: string;
    companyName: string;
}

export default function ActivityPage() {
    const [activities, setActivities] = useState<ActivityWithLead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAll() {
            const leadsRes = await fetch("/api/leads");
            const leadsData = await leadsRes.json();
            const leads: Lead[] = leadsData.leads || [];

            const results = await Promise.all(
                leads.map(async (lead) => {
                    const res = await fetch(`/api/leads/${lead._id}/activity`);
                    const data = await res.json();
                    return (data.activities || []).map((a: { _id: string; type: string; description: string; createdAt: string }) => ({
                        ...a,
                        leadId: lead._id,
                        companyName: lead.companyName,
                    }));
                })
            );

            const all = results
                .flat()
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

            setActivities(all);
            setLoading(false);
        }
        fetchAll();
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Activity Feed</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Real-time consolidated event log across all client accounts.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#1E293B] bg-[#131720] p-6 text-center text-slate-400 animate-pulse">
                    Loading system activity stream...
                </div>
            ) : activities.length === 0 ? (
                <div className="rounded-xl border border-[#1E293B] bg-[#131720] p-8 text-center text-slate-400">
                    No activity recorded yet.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {activities.map((a) => (
                        <div
                            key={a._id}
                            className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#1E293B] bg-[#131720] p-4 text-xs transition-all duration-200 hover:border-[#C9A961]/30 hover:scale-[1.005]"
                            onClick={() =>
                                (window.location.href = `/dashboard/leads/${a.leadId}`)
                            }
                        >
                            <div className="flex items-center gap-3">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">✓</span>
                                <div>
                                    <span className="font-bold text-white mr-2 hover:text-[#C9A961] transition-colors">{a.companyName}</span>
                                    <span className="text-slate-300">{a.description}</span>
                                </div>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-slate-500">
                                {new Date(a.createdAt).toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}