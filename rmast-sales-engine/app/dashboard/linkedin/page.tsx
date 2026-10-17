"use client";

import { useEffect, useState } from "react";

interface Message {
    _id: string;
    leadId: string;
    channel: string;
    direction: string;
    content: string;
    sentAt: string;
    lead: {
        companyName: string;
        location: string;
        market: string;
        status: string;
    } | null;
}

export default function LinkedInPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchMessages() {
            const res = await fetch("/api/messages?channel=linkedin");
            const data = await res.json();
            setMessages(data.messages || []);
            setLoading(false);
        }
        fetchMessages();
    }, []);

    const contacted = messages.length;
    const replied = messages.filter((m) => m.lead?.status === "Replied").length;
    const qualified = messages.filter(
        (m) => m.lead?.status === "Qualified"
    ).length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">LinkedIn InMail Outreach</h1>
                <p className="mt-1 text-sm text-slate-400">Professional InMail & connection message performance.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-5 shadow-lg">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Contacted</p>
                    <p className="mt-2 tabular-nums text-3xl font-black text-white">{contacted}</p>
                </div>
                <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-5 shadow-lg">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Replied</p>
                    <p className="mt-2 tabular-nums text-3xl font-black text-white">{replied}</p>
                </div>
                <div className="rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#070C0E] p-5 shadow-lg">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#FDE68A]">Meetings Booked</p>
                    <p className="mt-2 tabular-nums text-3xl font-black text-[#FBBF24]">{qualified}</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#132E32] bg-[#091215] shadow-xl">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-[#132E32] bg-[#070C0E] text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            <th className="px-5 py-3.5">Company</th>
                            <th className="px-5 py-3.5">Location</th>
                            <th className="px-5 py-3.5">InMail Content</th>
                            <th className="px-5 py-3.5">Sent</th>
                            <th className="px-5 py-3.5">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#132E32]/60">
                        {loading && (
                            <tr>
                                <td colSpan={5} className="px-5 py-8 text-center text-slate-400 animate-pulse">
                                    Loading LinkedIn history...
                                </td>
                            </tr>
                        )}
                        {!loading && messages.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                                    No LinkedIn outreach logged yet.
                                </td>
                            </tr>
                        )}
                        {messages.map((m) => (
                            <tr
                                key={m._id}
                                className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                                onClick={() =>
                                    (window.location.href = `/dashboard/leads/${m.leadId}`)
                                }
                            >
                                <td className="px-5 py-3.5 font-bold text-white hover:text-[#2DD4BF]">
                                    {m.lead?.companyName || "Unknown"}
                                </td>
                                <td className="px-5 py-3.5 text-slate-300">
                                    {m.lead ? `${m.lead.location}, ${m.lead.market}` : "—"}
                                </td>
                                <td className="max-w-xs truncate px-5 py-3.5 text-slate-400 font-mono text-xs">{m.content}</td>
                                <td className="px-5 py-3.5 text-slate-400 text-xs">
                                    {new Date(m.sentAt).toLocaleDateString()}
                                </td>
                                <td className="px-5 py-3.5">
                                    <span className="rounded-full bg-[#0D9488]/20 px-2.5 py-0.5 text-xs font-semibold text-[#2DD4BF] border border-[#0D9488]/40">
                                        {m.lead?.status || "Unknown"}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}