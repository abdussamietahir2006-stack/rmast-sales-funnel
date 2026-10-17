"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Feature {
    name: string;
    description: string;
    dataSource: string;
    viewType: string;
}

export default function CustomFeatureViewPage() {
    const params = useParams();
    const [feature, setFeature] = useState<Feature | null>(null);
    const [results, setResults] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        async function fetchData() {
            const res = await fetch(`/api/custom-features/${params.slug}`);
            if (res.ok) {
                const data = await res.json();
                setFeature(data.feature);
                setResults(data.results || []);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        }
        fetchData();
    }, [params.slug]);

    if (loading) return <p className="text-slate-400">Loading...</p>;
    if (notFound || !feature)
        return <p className="text-slate-400">Feature not found.</p>;

    const columns =
        results.length > 0
            ? Object.keys(results[0]).filter((k) => k !== "_id")
            : [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">{feature.name}</h1>
                {feature.description && (
                    <p className="mt-1 text-sm text-slate-400">{feature.description}</p>
                )}
            </div>

            {feature.viewType === "stat" ? (
                <div className="mt-6 rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#091215] p-6 text-center shadow-lg max-w-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Total Records</p>
                    <p className="mt-2 text-4xl font-extrabold text-white">{results.length}</p>
                </div>
            ) : (
                <div className="mt-6 overflow-hidden rounded-xl border border-[#132E32] bg-[#091215] shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-[#0D1B1E] border-b border-[#132E32] text-xs uppercase font-bold text-[#2DD4BF]">
                                <tr>
                                    {columns.slice(0, 6).map((col) => (
                                        <th key={col} className="px-4 py-3 capitalize tracking-wider">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#132E32]/60">
                                {results.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={columns.length || 1}
                                            className="px-4 py-6 text-center text-slate-400"
                                        >
                                            No matching records.
                                        </td>
                                    </tr>
                                ) : (
                                    results.map((r, i) => (
                                        <tr key={i} className="hover:bg-[#132E32]/30 transition-colors">
                                            {columns.slice(0, 6).map((col) => (
                                                <td key={col} className="px-4 py-3 text-slate-200">
                                                    {String(r[col] ?? "—")}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}