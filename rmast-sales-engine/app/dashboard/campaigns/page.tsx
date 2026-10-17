"use client";

import { useEffect, useState } from "react";

interface Campaign {
  _id: string;
  name: string;
  niche: string;
  country: string;
  locations: string[];
  leadCount: number;
  status: "Active" | "Paused";
  createdAt: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [country, setCountry] = useState("UAE");
  const [locations, setLocations] = useState("");

  async function fetchCampaigns() {
    setLoading(true);
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, niche, country, locations }),
    });

    setName("");
    setNiche("");
    setCountry("UAE");
    setLocations("");
    setShowForm(false);
    setSubmitting(false);
    fetchCampaigns();
  }

  async function handleToggleStatus(id: string, currentStatus: string) {
    setTogglingId(id);
    const newStatus = currentStatus === "Active" ? "Paused" : "Active";
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTogglingId(null);
    fetchCampaigns();
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = window.confirm(`Delete campaign "${name}"?`);
    if (!confirmed) return;

    setDeletingId(id);
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setDeletingId(null);
    fetchCampaigns();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-400">Organize lead discovery parameters into structured outreach campaigns.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981]"
        >
          {showForm ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-lg sm:grid-cols-2"
        >
          <input
            required
            placeholder="Campaign Name (e.g. Dubai Real Estate)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="sm:col-span-2 rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
          />
          <input
            required
            placeholder="Niche (e.g. Real Estate)"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
          >
            <option value="UAE">UAE</option>
            <option value="USA">USA</option>
            <option value="UK">UK</option>
            <option value="Saudi Arabia">Saudi Arabia</option>
            <option value="Canada">Canada</option>
            <option value="Australia">Australia</option>
          </select>
          <input
            required
            placeholder="Locations, comma separated (e.g. Dubai, Abu Dhabi)"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            className="sm:col-span-2 rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="sm:col-span-2 rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981] disabled:opacity-50"
          >
            {submitting ? "Creating Campaign..." : "Create Campaign"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-[#132E32] bg-[#091215] p-6 text-center text-slate-400 animate-pulse">
            Loading campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center text-slate-400">
            No campaigns yet. Create one to start organizing lead discovery.
          </div>
        ) : (
          campaigns.map((c) => (
            <div key={c._id} className="rounded-xl border border-[#1E3A2B] bg-gradient-to-br from-[#121C16] to-[#070C0E] p-5 shadow-lg transition-all duration-200 hover:border-[#4ADE80]/50 hover:scale-[1.005]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-base">{c.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {c.niche} · <span className="text-[#86EFAC]">{c.country}</span> · {c.locations.join(", ")}
                  </p>
                  <p className="mt-2 text-xs font-mono text-[#4ADE80]">
                    {c.leadCount} leads discovered
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${c.status === "Active"
                      ? "bg-[#059669]/20 text-[#34D399] border-[#059669]/40"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                  >
                    {c.status === "Active" ? "🟢 Active" : "⏸ Paused"}
                  </span>
                  <button
                    onClick={() => handleToggleStatus(c._id, c.status)}
                    disabled={togglingId === c._id}
                    className="rounded-lg border border-[#132E32] bg-[#070C0E] px-3 py-1.5 text-xs font-semibold text-[#2DD4BF] transition-all duration-200 hover:bg-[#0D9488]/20 disabled:opacity-40"
                  >
                    {togglingId === c._id
                      ? "..."
                      : c.status === "Active"
                        ? "Pause"
                        : "Resume"}
                  </button>
                  <button
                    onClick={() => handleDelete(c._id, c.name)}
                    disabled={deletingId === c._id}
                    className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-3 py-1.5 text-xs font-semibold text-[#FB7185] transition-all duration-200 hover:bg-[#9F1239]/20 disabled:opacity-40"
                  >
                    {deletingId === c._id ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}