"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Message {
    _id: string;
    leadId: string;
    channel: string;
    direction: string;
    content: string;
    sentiment?: string;
    sentAt: string;
}

const BUCKETS = [
    {
        label: "Positive",
        border: "border-[#1E3A2B]",
        bg: "from-[#121C16] to-[#070C0E]",
        accent: "text-[#4ADE80]",
    },
    {
        label: "Neutral",
        border: "border-[#164E53]",
        bg: "from-[#0E1D1F] to-[#070C0E]",
        accent: "text-[#2DD4BF]",
    },
    {
        label: "Negative",
        border: "border-[#423219]",
        bg: "from-[#1B1710] to-[#070C0E]",
        accent: "text-[#FBBF24]",
    },
    {
        label: "Not Interested",
        border: "border-[#4C1D24]",
        bg: "from-[#1F1015] to-[#070C0E]",
        accent: "text-[#FB7185]",
    },
    {
        label: "Unlabeled",
        border: "border-[#132E32]",
        bg: "from-[#091215] to-[#070C0E]",
        accent: "text-slate-400",
    },
] as const;

export default function SentimentPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAll() {
            const channels = ["email", "whatsapp", "instagram", "facebook", "linkedin"];
            const results = await Promise.all(
                channels.map((c) =>
                    fetch(`/api/messages?channel=${c}&direction=inbound`)
                        .then((r) => (r.ok ? r.json() : { messages: [] }))
                        .catch(() => ({ messages: [] }))
                )
            );
            setMessages(results.flatMap((r) => r.messages || []));
            setLoading(false);
        }
        fetchAll();
    }, []);

    function bucketFor(label: string) {
        if (label === "Unlabeled") return messages.filter((m) => !m.sentiment);
        return messages.filter((m) => m.sentiment === label);
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Reply Sentiment</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Inbound replies arrive through the email and WhatsApp webhooks and are
                    classified automatically.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-sm text-slate-400">
                    Loading replies…
                </div>
            ) : messages.length === 0 ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center">
                    <p className="text-sm font-medium text-slate-300">No replies received yet.</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        Replies appear once the provider webhooks are configured — point
                        Resend at <span className="font-mono text-slate-400">/api/webhooks/email</span>{" "}
                        and the WhatsApp Cloud API at{" "}
                        <span className="font-mono text-slate-400">/api/webhooks/whatsapp</span>.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {BUCKETS.map(({ label, border, bg, accent }) => {
                        const msgs = bucketFor(label);
                        return (
                            <div
                                key={label}
                                className={`rounded-xl border ${border} bg-gradient-to-br ${bg} p-5 shadow-lg`}
                            >
                                <h2 className={`mb-3 text-xs font-bold uppercase tracking-wider ${accent}`}>
                                    {label} ({msgs.length})
                                </h2>
                                {msgs.length === 0 ? (
                                    <p className="text-xs text-slate-500">Nothing here yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {msgs.slice(0, 5).map((m) => (
                                            <Link
                                                key={m._id}
                                                href={`/dashboard/leads/${m.leadId}`}
                                                className="block rounded-lg border border-[#132E32] bg-[#070C0E] p-3 transition-colors hover:border-[#2DD4BF]/40"
                                            >
                                                <p className="truncate text-xs text-slate-200">{m.content}</p>
                                                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                                                    {m.channel} · {new Date(m.sentAt).toLocaleDateString()}
                                                </p>
                                            </Link>
                                        ))}
                                        {msgs.length > 5 && (
                                            <p className="text-[10px] text-slate-500">
                                                + {msgs.length - 5} more
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
