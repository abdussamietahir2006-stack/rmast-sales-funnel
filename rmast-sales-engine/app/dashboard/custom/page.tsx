"use client";

import { useEffect, useState } from "react";
import { FILTERABLE_FIELDS } from "@/lib/custom-features";

interface Feature {
    _id: string;
    name: string;
    slug: string;
    description: string;
    dataSource: string;
    viewType: string;
}

export default function CustomFeaturesPage() {
    const [features, setFeatures] = useState<Feature[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [dataSource, setDataSource] = useState("leads");
    const [viewType, setViewType] = useState("table");
    const [filterField, setFilterField] = useState("");
    const [filterValue, setFilterValue] = useState("");

    async function fetchFeatures() {
        setLoading(true);
        const res = await fetch("/api/custom-features");
        const data = await res.json();
        setFeatures(data.features || []);
        setLoading(false);
    }

    useEffect(() => {
        fetchFeatures();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const res = await fetch("/api/custom-features", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                description,
                dataSource,
                viewType,
                filterField,
                filterValue,
            }),
        });
        const data = await res.json();

        if (!res.ok) {
            setError(data.error || "Something went wrong.");
        } else {
            setName("");
            setDescription("");
            setFilterField("");
            setFilterValue("");
            setShowForm(false);
            fetchFeatures();
            window.dispatchEvent(new Event("custom-features-updated"));
        }
        setSubmitting(false);
    }

    async function handleDelete(slug: string) {
        const confirmed = window.confirm("Delete this feature?");
        if (!confirmed) return;
        await fetch(`/api/custom-features/${slug}`, { method: "DELETE" });
        fetchFeatures();
        window.dispatchEvent(new Event("custom-features-updated"));
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Custom Features</h1>
                    <p className="mt-1 text-sm text-slate-400">
                        Build your own custom sidebar pages on top of your existing data.
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981]"
                >
                    {showForm ? "Cancel" : "+ Add Feature"}
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={handleCreate}
                    className="max-w-xl space-y-4 rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#091215] p-6 shadow-2xl"
                >
                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            Feature Name
                        </label>
                        <input
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Hot Prospects"
                            className="w-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            What should this feature do?
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Show all leads with a growth score above 80"
                            className="w-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                            rows={2}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            Data Source
                        </label>
                        <select
                            value={dataSource}
                            onChange={(e) => {
                                setDataSource(e.target.value);
                                // Fields are per-source, so a leftover choice
                                // would no longer be valid.
                                setFilterField("");
                            }}
                            className="w-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                        >
                            <option value="leads" className="bg-[#091215] text-slate-100">Leads</option>
                            <option value="messages" className="bg-[#091215] text-slate-100">Messages</option>
                            <option value="appointments" className="bg-[#091215] text-slate-100">Appointments</option>
                            <option value="activities" className="bg-[#091215] text-slate-100">Activities</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                            Display As
                        </label>
                        <select
                            value={viewType}
                            onChange={(e) => setViewType(e.target.value)}
                            className="w-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                        >
                            <option value="table" className="bg-[#091215] text-slate-100">Table (list of records)</option>
                            <option value="stat" className="bg-[#091215] text-slate-100">Stat (just a count)</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                Filter Field (optional)
                            </label>
                            {/* A dropdown rather than free text: the field name
                                goes into a database query, so only the
                                allowlisted ones are offered — and the server
                                rejects anything else regardless. */}
                            <select
                                value={filterField}
                                onChange={(e) => setFilterField(e.target.value)}
                                className="w-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                            >
                                <option value="" className="bg-[#091215] text-slate-100">
                                    No filter
                                </option>
                                {(FILTERABLE_FIELDS[dataSource] || []).map((field) => (
                                    <option
                                        key={field}
                                        value={field}
                                        className="bg-[#091215] text-slate-100"
                                    >
                                        {field}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                                Filter Value (optional)
                            </label>
                            <input
                                value={filterValue}
                                onChange={(e) => setFilterValue(e.target.value)}
                                placeholder="e.g. Won"
                                className="w-full rounded-lg border border-[#132E32] bg-[#091215] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                            />
                        </div>
                    </div>
                    {error && <p className="text-sm text-rose-400">{error}</p>}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981] disabled:opacity-50"
                    >
                        {submitting ? "Creating..." : "Create Feature"}
                    </button>
                </form>
            )}

            <div className="mt-6 space-y-3">
                {loading ? (
                    <p className="text-slate-400">Loading...</p>
                ) : features.length === 0 ? (
                    <p className="text-slate-400">No custom features yet.</p>
                ) : (
                    features.map((f) => (
                        <div
                            key={f._id}
                            className="flex items-center justify-between rounded-xl border border-[#132E32] bg-[#091215] p-4 text-sm hover:border-[#2DD4BF]/40 transition-all shadow-md"
                        >
                            <div>
                                <p
                                    className="cursor-pointer font-bold text-slate-100 hover:text-[#2DD4BF] transition-colors"
                                    onClick={() =>
                                        (window.location.href = `/dashboard/custom/${f.slug}`)
                                    }
                                >
                                    {f.name}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">{f.description}</p>
                            </div>
                            <button
                                onClick={() => handleDelete(f.slug)}
                                className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:underline px-2 py-1 rounded"
                            >
                                Delete
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}