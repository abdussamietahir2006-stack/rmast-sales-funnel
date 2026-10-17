"use client";

import { useEffect, useState } from "react";

interface Lead {
    status: string;
}

export default function GoalsPage() {
    const [target, setTarget] = useState<number | null>(null);
    const [inputValue, setInputValue] = useState("");
    const [wonCount, setWonCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function fetchData() {
        const [goalRes, leadsRes] = await Promise.all([
            fetch("/api/goals"),
            fetch("/api/leads"),
        ]);
        const goalData = await goalRes.json();
        const leadsData = await leadsRes.json();

        setTarget(goalData.goal?.targetClients ?? null);
        setInputValue(goalData.goal?.targetClients?.toString() ?? "");
        const won = (leadsData.leads || []).filter(
            (l: Lead) => l.status === "Won"
        ).length;
        setWonCount(won);
        setLoading(false);
    }

    useEffect(() => {
        fetchData();
    }, []);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        await fetch("/api/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetClients: inputValue }),
        });
        setSaving(false);
        fetchData();
    }

    const progress = target ? Math.min((wonCount / target) * 100, 100) : 0;

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Monthly Client Goals</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Track client acquisition progress against monthly funnel quotas.
                </p>
            </div>

            {loading ? (
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
                    Loading monthly goals...
                </div>
            ) : (
                <>
                    <form onSubmit={handleSave} className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-lg space-y-4">
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                    Monthly Client Target
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                                    placeholder="e.g. 5"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] px-5 py-2 text-sm font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981] disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save Target"}
                            </button>
                        </div>
                    </form>

                    {target && (
                        <div className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-6 shadow-lg">
                            <div className="mb-3 flex items-center justify-between text-sm">
                                <span className="font-bold text-white">
                                    <span className="tabular-nums text-[#4ADE80] text-xl mr-1">{wonCount}</span> / <span className="tabular-nums text-slate-300">{target}</span> clients won this month
                                </span>
                                <span className="font-mono text-sm font-bold text-[#86EFAC]">{progress.toFixed(0)}%</span>
                            </div>
                            <div className="h-3 w-full overflow-hidden rounded-full bg-[#070C0E] border border-[#1E3A2B]">
                                <div
                                    className="h-full bg-gradient-to-r from-[#059669] to-[#34D399] transition-all duration-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}