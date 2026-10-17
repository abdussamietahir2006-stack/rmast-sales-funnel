"use client";

import { useEffect, useState } from "react";

interface Lead {
    _id: string;
    companyName: string;
    niche: string;
    market: string;
    location: string;
    website?: string;
    phone?: string;
    email?: string;
    status: string;
    activityVerdict?: "active" | "review" | "inactive";
    activityScore?: number;
    createdAt: string;
}

interface ImportResult {
    examined: number;
    inserted: number;
    skippedDuplicates: number;
    skippedInvalid: number;
    invalidSamples: { row: number; reason: string }[];
}

const COUNTRIES = ["UAE", "USA", "UK", "Saudi Arabia", "Canada", "Australia"];

function getStatusBadgeClass(status: string) {
    const s = (status || "").toLowerCase();
    if (s.includes("won") || s.includes("replied") || s.includes("positive") || s.includes("new")) {
        return "bg-[#059669]/20 text-[#34D399] border-[#059669]/40";
    }
    if (s.includes("analyz") || s.includes("qualif") || s.includes("pending")) {
        return "bg-[#D97706]/20 text-[#FBBF24] border-[#D97706]/40";
    }
    if (s.includes("contact") || s.includes("outreach") || s.includes("sent")) {
        return "bg-[#0D9488]/20 text-[#2DD4BF] border-[#0D9488]/40";
    }
    if (s.includes("lost") || s.includes("unreachable")) {
        return "bg-[#9F1239]/20 text-[#FB7185] border-[#9F1239]/40";
    }
    return "bg-slate-800 text-slate-300 border-slate-700";
}

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [message, setMessage] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [niche, setNiche] = useState("");
    const [country, setCountry] = useState("UAE");
    const [state, setState] = useState("");
    const [count, setCount] = useState(50);

    const [showManualForm, setShowManualForm] = useState(false);
    const [manualSubmitting, setManualSubmitting] = useState(false);
    const [manualCompanyName, setManualCompanyName] = useState("");
    const [manualNiche, setManualNiche] = useState("");
    const [manualMarket, setManualMarket] = useState("");
    const [manualLocation, setManualLocation] = useState("");
    const [manualWebsite, setManualWebsite] = useState("");
    const [manualPhone, setManualPhone] = useState("");
    const [manualEmail, setManualEmail] = useState("");

    const [showImportForm, setShowImportForm] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importNiche, setImportNiche] = useState("");
    const [importMarket, setImportMarket] = useState("");
    const [importLocation, setImportLocation] = useState("");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importError, setImportError] = useState("");

    const [autoSendEnabled, setAutoSendEnabled] = useState(false);
    const [autoSendLoaded, setAutoSendLoaded] = useState(false);
    const [togglingAutoSend, setTogglingAutoSend] = useState(false);

    async function fetchLeads() {
        setLoading(true);
        const res = await fetch("/api/leads");
        const data = await res.json();
        setLeads(data.leads || []);
        setLoading(false);
    }

    async function fetchAutoSend() {
        const res = await fetch("/api/settings");
        if (res.ok) {
            const data = await res.json();
            setAutoSendEnabled(data.settings?.autoSendEnabled === true);
        }
        setAutoSendLoaded(true);
    }

    useEffect(() => {
        fetchLeads();
        fetchAutoSend();
    }, []);

    async function handleToggleAutoSend() {
        const next = !autoSendEnabled;
        setTogglingAutoSend(true);
        // Reflect the change immediately; roll back below if the save fails.
        setAutoSendEnabled(next);

        try {
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ autoSendEnabled: next }),
            });
            if (!res.ok) {
                setAutoSendEnabled(!next);
                setMessage("Could not update auto-send. Try again.");
            }
        } catch {
            setAutoSendEnabled(!next);
            setMessage("Could not reach the server.");
        }

        setTogglingAutoSend(false);
    }

    async function handleFindLeads(e: React.FormEvent) {
        e.preventDefault();
        setSearching(true);
        setMessage("");

        const res = await fetch("/api/leads/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ niche, country, state, count }),
        });

        const data = await res.json();

        if (!res.ok) {
            setMessage(data.error || "Something went wrong.");
        } else {
            setMessage(`Found and added ${data.count} new leads.`);
            fetchLeads();
        }

        setSearching(false);
    }

    async function handleManualSubmit(e: React.FormEvent) {
        e.preventDefault();
        setManualSubmitting(true);

        await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                companyName: manualCompanyName,
                niche: manualNiche,
                market: manualMarket,
                location: manualLocation,
                website: manualWebsite,
                phone: manualPhone,
                email: manualEmail,
            }),
        });

        setManualCompanyName("");
        setManualNiche("");
        setManualMarket("");
        setManualLocation("");
        setManualWebsite("");
        setManualPhone("");
        setManualEmail("");
        setShowManualForm(false);
        setManualSubmitting(false);
        fetchLeads();
    }

    async function handleImport(e: React.FormEvent) {
        e.preventDefault();
        if (!importFile) return;

        setImporting(true);
        setImportError("");
        setImportResult(null);

        const formData = new FormData();
        formData.append("file", importFile);
        if (importNiche) formData.append("niche", importNiche);
        if (importMarket) formData.append("market", importMarket);
        if (importLocation) formData.append("location", importLocation);

        try {
            const res = await fetch("/api/leads/import", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) {
                setImportError(data.error || "Import failed.");
            } else {
                setImportResult(data);
                fetchLeads();
            }
        } catch {
            setImportError("Could not reach the server.");
        }

        setImporting(false);
    }

    async function handleDelete(id: string, companyName: string) {
        const confirmed = window.confirm(
            `Delete "${companyName}"? This cannot be undone.`
        );
        if (!confirmed) return;

        setDeletingId(id);
        await fetch(`/api/leads/${id}`, { method: "DELETE" });
        setDeletingId(null);
        fetchLeads();
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Leads Directory</h1>
                    <p className="mt-1 text-sm text-slate-400">Discover, filter, and manage prospect accounts across jewel-toned channels.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleToggleAutoSend}
                        disabled={!autoSendLoaded || togglingAutoSend}
                        title="Controls whether the scheduled run sends outreach on its own"
                        className={`flex items-center gap-2.5 rounded-lg border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 ${autoSendEnabled
                            ? "border-[#B45309]/60 bg-gradient-to-r from-[#1B1710] to-[#0B0906] text-[#FBBF24] hover:border-[#F59E0B]"
                            : "border-[#132E32] bg-[#070C0E] text-slate-400 hover:border-[#2DD4BF]/50 hover:text-[#2DD4BF]"
                            }`}
                    >
                        <span
                            className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors duration-200 ${autoSendEnabled ? "bg-[#F59E0B]" : "bg-slate-700"
                                }`}
                        >
                            <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 ${autoSendEnabled ? "translate-x-4" : "translate-x-0.5"
                                    }`}
                            />
                        </span>
                        Auto-Send {autoSendEnabled ? "ON" : "OFF"}
                    </button>
                    <button
                        onClick={() => {
                            setShowImportForm(!showImportForm);
                            setShowManualForm(false);
                        }}
                        className="rounded-lg border border-[#164E53] bg-gradient-to-r from-[#0E1D1F] to-[#070C0E] px-4 py-2 text-xs font-semibold text-[#2DD4BF] transition-all duration-200 hover:border-[#2DD4BF]"
                    >
                        {showImportForm ? "Cancel Import" : "⬆ Import Leads"}
                    </button>
                    <button
                        onClick={() => {
                            setShowManualForm(!showManualForm);
                            setShowImportForm(false);
                        }}
                        className="rounded-lg border border-[#4D7C0F]/50 bg-gradient-to-r from-[#14281D] to-[#0B130E] px-4 py-2 text-xs font-semibold text-[#86EFAC] transition-all duration-200 hover:border-[#4ADE80]"
                    >
                        {showManualForm ? "Cancel Manual Add" : "+ Add Test Lead"}
                    </button>
                </div>
            </div>

            {autoSendLoaded && (
                <div
                    className={`rounded-lg border px-4 py-2.5 text-xs leading-relaxed ${autoSendEnabled
                        ? "border-[#B45309]/40 bg-[#B45309]/10 text-[#FDE68A]"
                        : "border-[#132E32] bg-[#091215] text-slate-500"
                        }`}
                >
                    {autoSendEnabled
                        ? "Auto-Send is ON — every lead's email and WhatsApp outreach sends the moment it's drafted, unattended, on the scheduled run. No per-lead review."
                        : "Auto-Send is OFF — the engine drafts everything but sends nothing on its own. Send each message yourself from that lead's page."}
                </div>
            )}

            {showImportForm && (
                <form
                    onSubmit={handleImport}
                    className="space-y-4 rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#091215] p-6 shadow-lg"
                >
                    <p className="text-xs leading-relaxed text-slate-400">
                        Already have leads from your own search? Upload a CSV, Excel
                        (.xlsx/.xls), or PDF list and the engine takes it from there —
                        imported companies become <span className="text-[#2DD4BF]">New</span>{" "}
                        leads and go through analysis, audit, demo, and outreach exactly
                        like a discovered one. Auto-discovery above is unaffected.
                    </p>

                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            File
                        </label>
                        <input
                            required
                            type="file"
                            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                            className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-[#0D9488]/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#2DD4BF] hover:file:bg-[#0D9488]/30"
                        />
                        <p className="mt-1.5 text-[11px] text-slate-500">
                            CSV/Excel: column headers like &quot;Company&quot;, &quot;Phone&quot;,
                            &quot;Website&quot; etc. are matched automatically. PDF text is read by
                            AI, so it needs AI_API_KEY configured.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                                Default Niche
                            </label>
                            <input
                                placeholder="used if a row has none"
                                value={importNiche}
                                onChange={(e) => setImportNiche(e.target.value)}
                                className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-[#2DD4BF] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                                Default Market
                            </label>
                            <input
                                placeholder="e.g. UAE"
                                value={importMarket}
                                onChange={(e) => setImportMarket(e.target.value)}
                                className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-[#2DD4BF] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                                Default Location
                            </label>
                            <input
                                placeholder="e.g. Dubai"
                                value={importLocation}
                                onChange={(e) => setImportLocation(e.target.value)}
                                className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-[#2DD4BF] focus:outline-none"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={importing || !importFile}
                        className="w-full rounded-lg bg-gradient-to-r from-[#0D9488] via-[#059669] to-[#4D7C0F] py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                    >
                        {importing ? "Importing..." : "Import Leads"}
                    </button>

                    {importError && (
                        <div className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-4 py-3 text-xs text-[#FB7185]">
                            {importError}
                        </div>
                    )}

                    {importResult && (
                        <div className="rounded-lg border border-[#0D9488]/40 bg-[#0D9488]/10 p-4 text-xs text-[#2DD4BF]">
                            <p className="font-semibold">
                                Examined {importResult.examined} row(s): added{" "}
                                {importResult.inserted} new lead(s).
                            </p>
                            {(importResult.skippedDuplicates > 0 || importResult.skippedInvalid > 0) && (
                                <p className="mt-1 text-slate-400">
                                    {importResult.skippedDuplicates > 0 &&
                                        `${importResult.skippedDuplicates} already in the database`}
                                    {importResult.skippedDuplicates > 0 && importResult.skippedInvalid > 0 && " · "}
                                    {importResult.skippedInvalid > 0 &&
                                        `${importResult.skippedInvalid} skipped (no company name found)`}
                                </p>
                            )}
                            {importResult.invalidSamples.length > 0 && (
                                <ul className="mt-2 space-y-1 border-t border-[#0D9488]/30 pt-2 text-slate-500">
                                    {importResult.invalidSamples.map((s, i) => (
                                        <li key={i}>
                                            Row {s.row}: {s.reason}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </form>
            )}

            {showManualForm && (
                <form
                    onSubmit={handleManualSubmit}
                    className="grid grid-cols-1 gap-4 rounded-xl border border-[#423219] bg-gradient-to-br from-[#1B1710] to-[#0A0E14] p-6 shadow-lg sm:grid-cols-2"
                >
                    <p className="col-span-full text-xs text-[#FDE68A]">
                        ⚡ For testing purposes — automated discovery will populate real leads below.
                    </p>
                    <input
                        required
                        placeholder="Company Name"
                        value={manualCompanyName}
                        onChange={(e) => setManualCompanyName(e.target.value)}
                        className="rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <input
                        required
                        placeholder="Niche"
                        value={manualNiche}
                        onChange={(e) => setManualNiche(e.target.value)}
                        className="rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <input
                        required
                        placeholder="Market"
                        value={manualMarket}
                        onChange={(e) => setManualMarket(e.target.value)}
                        className="rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <input
                        required
                        placeholder="Location"
                        value={manualLocation}
                        onChange={(e) => setManualLocation(e.target.value)}
                        className="rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <input
                        placeholder="Website"
                        value={manualWebsite}
                        onChange={(e) => setManualWebsite(e.target.value)}
                        className="rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <input
                        placeholder="Phone"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        className="rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <input
                        placeholder="Email"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        className="col-span-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={manualSubmitting}
                        className="col-span-full rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981] disabled:opacity-50"
                    >
                        {manualSubmitting ? "Saving..." : "Save Test Lead"}
                    </button>
                </form>
            )}

            <form
                onSubmit={handleFindLeads}
                className="grid grid-cols-1 gap-4 rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#091215] p-6 shadow-lg sm:grid-cols-4"
            >
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Niche</label>
                    <input
                        required
                        placeholder="e.g. Real Estate"
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Country</label>
                    <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                    >
                        {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">City / State</label>
                    <input
                        required
                        placeholder="e.g. Dubai"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Count</label>
                    <input
                        type="number"
                        min={1}
                        max={200}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <button
                    type="submit"
                    disabled={searching}
                    className="col-span-full rounded-lg bg-gradient-to-r from-[#0D9488] via-[#059669] to-[#4D7C0F] py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                >
                    {searching ? "Discovering Leads..." : "Auto-Discover Leads"}
                </button>
            </form>

            {message && (
                <div className="rounded-lg border border-[#0D9488]/40 bg-[#0D9488]/10 px-4 py-3 text-sm text-[#2DD4BF]">
                    {message}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-[#132E32] bg-[#091215] shadow-xl">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-[#132E32] bg-[#070C0E] text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            <th className="px-5 py-3.5">Company</th>
                            <th className="px-5 py-3.5">Niche</th>
                            <th className="px-5 py-3.5">Market</th>
                            <th className="px-5 py-3.5">Location</th>
                            <th className="px-5 py-3.5">Website</th>
                            <th className="px-5 py-3.5">Status</th>
                            <th className="px-5 py-3.5">Activity</th>
                            <th className="px-5 py-3.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#132E32]/60">
                        {loading && (
                            <tr>
                                <td colSpan={8} className="px-5 py-8 text-center text-slate-400 animate-pulse">
                                    Loading leads database...
                                </td>
                            </tr>
                        )}
                        {!loading && leads.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                                    No leads recorded. Use &quot;Auto-Discover Leads&quot; above to search.
                                </td>
                            </tr>
                        )}
                        {leads.map((lead) => (
                            <tr key={lead._id} className="transition-colors duration-150 hover:bg-white/[0.03]">
                                <td
                                    className="cursor-pointer px-5 py-3.5 font-semibold text-white hover:text-[#2DD4BF] transition-colors"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    {lead.companyName}
                                </td>
                                <td
                                    className="cursor-pointer px-5 py-3.5 text-slate-300"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    {lead.niche}
                                </td>
                                <td
                                    className="cursor-pointer px-5 py-3.5 text-slate-300"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    {lead.market}
                                </td>
                                <td
                                    className="cursor-pointer px-5 py-3.5 text-slate-300"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    {lead.location}
                                </td>
                                <td
                                    className="cursor-pointer px-5 py-3.5 text-slate-400"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    {lead.website || "—"}
                                </td>
                                <td
                                    className="cursor-pointer px-5 py-3.5"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getStatusBadgeClass(lead.status)}`}>
                                        {lead.status}
                                    </span>
                                </td>
                                <td
                                    className="cursor-pointer px-5 py-3.5"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/leads/${lead._id}`)
                                    }
                                >
                                    {lead.activityVerdict ? (
                                        <span
                                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${lead.activityVerdict === "inactive"
                                                ? "border-[#9F1239]/40 bg-[#9F1239]/10 text-[#FB7185]"
                                                : lead.activityVerdict === "review"
                                                    ? "border-[#B45309]/40 bg-[#B45309]/10 text-[#FBBF24]"
                                                    : "border-[#059669]/40 bg-[#059669]/10 text-[#34D399]"
                                                }`}
                                            title={`Activity score ${lead.activityScore}/100`}
                                        >
                                            {lead.activityVerdict === "inactive"
                                                ? "💀 Inactive"
                                                : lead.activityVerdict === "review"
                                                    ? "⚠ Review"
                                                    : "✓ Active"}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-600">Not checked</span>
                                    )}
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                    <button
                                        onClick={() => handleDelete(lead._id, lead.companyName)}
                                        disabled={deletingId === lead._id}
                                        className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-3 py-1 text-xs font-semibold text-[#FB7185] transition-all duration-200 hover:bg-[#9F1239]/20 disabled:opacity-40"
                                    >
                                        {deletingId === lead._id ? "Deleting..." : "Delete"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}