"use client";

import { useEffect, useState } from "react";

interface PlanResponse {
    date: string;
    todayTotal: number | null;
    lastTotal: number | null;
    suggested: number;
    effectiveTotal: number;
    max: number;
    campaigns: { id: string; name: string }[];
}

function splitAcross(total: number, parts: number): number[] {
    if (parts <= 0) return [];
    const base = Math.floor(total / parts);
    return Array.from({ length: parts }, (_, i) => base + (i < total % parts ? 1 : 0));
}

/**
 * Asks "how many leads today?" the first time the dashboard opens each day,
 * and shows today's number in the sidebar so it can be changed later. The
 * nightly run finds exactly this many, split evenly across active campaigns.
 */
export default function DailyLeadsPrompt() {
    const [plan, setPlan] = useState<PlanResponse | null>(null);
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await fetch("/api/settings/daily-leads");
            if (!res.ok || cancelled) return;
            const data: PlanResponse = await res.json();
            setPlan(data);
            setValue(String(data.todayTotal ?? data.suggested));
            if (data.todayTotal === null) setOpen(true);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError("");
        const res = await fetch("/api/settings/daily-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ total: Number(value) }),
        });
        const data = await res.json().catch(() => ({}));
        setSaving(false);
        if (!res.ok) {
            setError(data.error || "Could not save.");
            return;
        }
        setPlan((p) => (p ? { ...p, todayTotal: data.total, effectiveTotal: data.total } : p));
        setOpen(false);
    }

    if (!plan) return null;

    const total = Math.min(Math.max(Math.round(Number(value)) || 0, 0), plan.max);
    const split = splitAcross(total, plan.campaigns.length);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mb-6 w-full rounded-lg border border-[#164E53] bg-[#0E1D1F] px-3.5 py-2.5 text-left transition-colors hover:border-[#2DD4BF]/60"
            >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#2DD4BF]">Leads for today</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                    {plan.todayTotal ?? plan.effectiveTotal}
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                        {plan.todayTotal === null ? "(not set, using last)" : "· edit"}
                    </span>
                </p>
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="daily-leads-title">
                    <form
                        onSubmit={save}
                        className="w-full max-w-sm rounded-xl border border-[#164E53] bg-gradient-to-b from-[#091215] to-[#0D181A] p-6 shadow-2xl"
                    >
                        <h2 id="daily-leads-title" className="text-lg font-bold text-white">
                            How many leads today?
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">
                            Tonight&apos;s 9 PM run finds and prepares this many new leads, split across your active
                            campaigns. Raise it slowly while your email warms up (max {plan.max}).
                            {plan.lastTotal !== null && ` Last time: ${plan.lastTotal}.`}
                        </p>

                        <input
                            type="number"
                            min={1}
                            max={plan.max}
                            required
                            autoFocus
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="mt-5 w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-3 text-2xl font-bold text-white focus:border-[#2DD4BF] focus:outline-none"
                        />

                        {plan.campaigns.length > 0 ? (
                            <ul className="mt-4 space-y-1.5 text-sm">
                                {plan.campaigns.map((c, i) => (
                                    <li key={c.id} className="flex justify-between text-slate-300">
                                        <span>{c.name}</span>
                                        <span className="font-semibold text-[#2DD4BF]">{split[i]}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-4 text-xs text-[#FBBF24]">No active campaigns, so no leads will be found.</p>
                        )}

                        {error && <p className="mt-3 text-xs text-[#FB7185]">{error}</p>}

                        <div className="mt-6 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="flex-1 rounded-lg border border-[#132E32] py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.03]"
                            >
                                Later
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Set for today"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
