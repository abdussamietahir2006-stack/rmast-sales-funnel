"use client";

import { useEffect, useState } from "react";

interface Appointment {
    _id: string;
    leadId: string;
    companyName: string;
    scheduledAt: string;
    serviceInterest?: string;
    budget?: string;
    timeline?: string;
    status: string;
}

export default function CalendarPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAppointments() {
            const res = await fetch("/api/appointments");
            const data = await res.json();
            setAppointments(data.appointments || []);
            setLoading(false);
        }
        fetchAppointments();
    }, []);

    const now = new Date();
    const upcoming = appointments.filter(
        (a) => new Date(a.scheduledAt) >= now
    );
    const past = appointments.filter((a) => new Date(a.scheduledAt) < now);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Strategy Call Calendar</h1>
                <p className="mt-1 text-sm text-slate-400">
                    All booked strategy sessions and sales calls across lead accounts.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Loading appointments schedule...
                </div>
            ) : (
                <div className="space-y-8">
                    <div>
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#2DD4BF] flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#2DD4BF]" />
                            Upcoming Strategy Briefings ({upcoming.length})
                        </h2>
                        {upcoming.length === 0 ? (
                            <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-xs text-slate-400">
                                No upcoming calls scheduled.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {upcoming.map((a) => (
                                    <div
                                        key={a._id}
                                        className="cursor-pointer rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-4 text-xs shadow-md transition-all duration-200 hover:border-[#2DD4BF]/50 hover:scale-[1.005]"
                                        onClick={() =>
                                            (window.location.href = `/dashboard/leads/${a.leadId}`)
                                        }
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="font-bold text-white text-sm hover:text-[#2DD4BF]">{a.companyName}</p>
                                            <span className="rounded-full bg-[#059669]/20 px-2.5 py-0.5 text-xs font-semibold text-[#34D399] border border-[#059669]/40">
                                                {a.status}
                                            </span>
                                        </div>
                                        <p className="text-slate-300 font-mono text-xs mt-1">
                                            📅 {new Date(a.scheduledAt).toLocaleString()}
                                        </p>
                                        {a.serviceInterest && (
                                            <p className="mt-2 text-xs text-slate-400 border-t border-[#132E32] pt-2">
                                                Interested in: <span className="text-[#2DD4BF] font-semibold">{a.serviceInterest}</span>
                                                {a.budget ? ` · Budget: ${a.budget}` : ""}
                                                {a.timeline ? ` · Timeline: ${a.timeline}` : ""}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-slate-600" />
                            Past Call History ({past.length})
                        </h2>
                        {past.length === 0 ? (
                            <div className="rounded-xl border border-[#132E32]/60 bg-[#091215]/50 p-6 text-center text-xs text-slate-500">
                                No past call logs recorded yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {past.map((a) => (
                                    <div
                                        key={a._id}
                                        className="cursor-pointer rounded-lg border border-[#132E32]/60 bg-[#070C0E] p-3 text-xs opacity-70 transition-all hover:opacity-100 hover:border-[#164E53]"
                                        onClick={() =>
                                            (window.location.href = `/dashboard/leads/${a.leadId}`)
                                        }
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="font-semibold text-slate-200">{a.companyName}</p>
                                            <p className="text-slate-500 text-[11px] font-mono">
                                                {new Date(a.scheduledAt).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}