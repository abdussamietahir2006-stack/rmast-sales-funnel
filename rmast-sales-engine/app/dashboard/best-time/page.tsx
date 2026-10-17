"use client";

import { useEffect, useState } from "react";

interface Message {
    _id: string;
    channel: string;
    direction: string;
    sentAt: string;
    leadId: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BestTimePage() {
    const [outbound, setOutbound] = useState<Message[]>([]);
    const [inbound, setInbound] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAll() {
            const channels = ["email", "whatsapp", "instagram", "facebook", "linkedin"];
            const results = await Promise.all(
                channels.map((c) =>
                    fetch(`/api/messages?channel=${c}`).then((r) => r.json())
                )
            );
            const all = results.flatMap((r) => r.messages || []);
            setOutbound(all.filter((m: Message) => m.direction === "outbound"));
            setInbound(all.filter((m: Message) => m.direction === "inbound"));
            setLoading(false);
        }
        fetchAll();
    }, []);

    // Reply rate by day-of-week the outbound message was sent
    const dayStats = DAYS.map((day, i) => {
        const sentOnDay = outbound.filter(
            (m) => new Date(m.sentAt).getDay() === i
        );
        const leadIdsRepliedTo = new Set(inbound.map((m) => m.leadId));
        const repliedCount = sentOnDay.filter((m) =>
            leadIdsRepliedTo.has(m.leadId)
        ).length;
        return {
            day,
            sent: sentOnDay.length,
            replied: repliedCount,
            rate: sentOnDay.length ? (repliedCount / sentOnDay.length) * 100 : 0,
        };
    });

    const hasEnoughData = outbound.length >= 10;

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Best Time to Contact</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Response rates calculated by dispatch day of week, based on your outreach history.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Analyzing response time patterns...
                </div>
            ) : !hasEnoughData ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center text-slate-400">
                    Not enough outreach data dispatched yet to spot statistical patterns. Performance metrics will populate as outreach volume grows.
                </div>
            ) : (
                <div className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-lg space-y-4">
                    {dayStats.map((d) => (
                        <div key={d.day} className="flex items-center gap-4">
                            <span className="w-10 text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">{d.day}</span>
                            <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#070C0E] border border-[#132E32]">
                                <div
                                    className="h-full bg-gradient-to-r from-[#0D9488] to-[#059669] transition-all duration-500 shadow-[0_0_10px_rgba(20,184,166,0.4)]"
                                    style={{ width: `${d.rate}%` }}
                                />
                            </div>
                            <span className="w-28 text-right font-mono text-xs text-slate-300">
                                <span className="font-bold text-[#2DD4BF]">{d.rate.toFixed(0)}%</span> ({d.sent} sent)
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}