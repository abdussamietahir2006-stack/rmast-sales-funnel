"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Lead {
    _id: string;
    companyName: string;
    status: string;
    createdAt: string;
    firstContactedAt?: string;
    firstReplyAt?: string;
}

interface Appointment {
    _id: string;
    leadId: string;
    companyName: string;
    scheduledAt: string;
}

const COLD_AFTER_DAYS = 7;

function Section({
    title,
    subtitle,
    accent,
    border,
    empty,
    children,
}: {
    title: string;
    subtitle?: string;
    accent: string;
    border: string;
    empty: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className={`rounded-xl border ${border} bg-[#091215] p-6 shadow-lg`}>
            <h2 className={`text-xs font-bold uppercase tracking-wider ${accent}`}>{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
            <div className="mt-3">{empty ? null : children}</div>
        </div>
    );
}

export default function DigestPage() {
    const [newLeadsToday, setNewLeadsToday] = useState<Lead[]>([]);
    const [callsToday, setCallsToday] = useState<Appointment[]>([]);
    const [coldLeads, setColdLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            const [leadsRes, apptsRes] = await Promise.all([
                fetch("/api/leads"),
                fetch("/api/appointments"),
            ]);
            const leadsData = await leadsRes.json();
            const apptsData = await apptsRes.json();

            const leads: Lead[] = leadsData.leads || [];
            const appointments: Appointment[] = apptsData.appointments || [];

            const today = new Date().toDateString();

            setNewLeadsToday(
                leads.filter((l) => new Date(l.createdAt).toDateString() === today)
            );

            setCallsToday(
                appointments.filter(
                    (a) => new Date(a.scheduledAt).toDateString() === today
                )
            );

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - COLD_AFTER_DAYS);

            setColdLeads(
                leads.filter((lead) => {
                    if (!["Contacted", "Replied"].includes(lead.status)) return false;
                    // Measure from the last thing that actually happened, not
                    // from when the lead was created — a lead contacted
                    // yesterday isn't cold just because it was found last month.
                    const lastTouch = new Date(
                        lead.firstReplyAt || lead.firstContactedAt || lead.createdAt
                    );
                    return lastTouch < cutoff;
                })
            );

            setLoading(false);
        }
        fetchData();
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Daily Digest</h1>
                <p className="mt-1 text-sm text-slate-400">
                    {new Date().toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                    })}
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-sm text-slate-400">
                    Building today&apos;s digest…
                </div>
            ) : (
                <div className="space-y-5">
                    <Section
                        title={`New Leads Today (${newLeadsToday.length})`}
                        accent="text-[#2DD4BF]"
                        border="border-[#164E53]"
                        empty={false}
                    >
                        {newLeadsToday.length === 0 ? (
                            <p className="text-xs text-slate-500">None yet.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {newLeadsToday.map((lead) => (
                                    <Link
                                        key={lead._id}
                                        href={`/dashboard/leads/${lead._id}`}
                                        className="block text-sm text-slate-200 hover:text-[#2DD4BF]"
                                    >
                                        {lead.companyName}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section
                        title={`Calls Today (${callsToday.length})`}
                        accent="text-[#FDE68A]"
                        border="border-[#423219]"
                        empty={false}
                    >
                        {callsToday.length === 0 ? (
                            <p className="text-xs text-slate-500">No calls scheduled today.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {callsToday.map((appointment) => (
                                    <Link
                                        key={appointment._id}
                                        href={`/dashboard/leads/${appointment.leadId}`}
                                        className="flex items-center justify-between text-sm text-slate-200 hover:text-[#FBBF24]"
                                    >
                                        <span>{appointment.companyName}</span>
                                        <span className="font-mono text-xs text-slate-400">
                                            {new Date(appointment.scheduledAt).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section
                        title={`Going Cold (${coldLeads.length})`}
                        subtitle={`Contacted or replied, with no movement in over ${COLD_AFTER_DAYS} days.`}
                        accent="text-[#FDA4AF]"
                        border="border-[#4C1D24]"
                        empty={false}
                    >
                        {coldLeads.length === 0 ? (
                            <p className="text-xs text-slate-500">Nothing going cold. 🎉</p>
                        ) : (
                            <div className="space-y-1.5">
                                {coldLeads.map((lead) => (
                                    <Link
                                        key={lead._id}
                                        href={`/dashboard/leads/${lead._id}`}
                                        className="flex items-center justify-between text-sm text-slate-200 hover:text-[#FB7185]"
                                    >
                                        <span>{lead.companyName}</span>
                                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                                            {lead.status}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Section>
                </div>
            )}
        </div>
    );
}
