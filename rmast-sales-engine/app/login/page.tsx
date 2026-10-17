"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        setLoading(false);

        if (res.ok) {
            router.push("/dashboard");
        } else {
            const data = await res.json();
            setError(data.error || "Login failed");
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-[#070C0E] px-4 text-slate-100 antialiased overflow-hidden">
            {/* Multi-Jewel Ambient Glowing Orbs */}
            <div className="absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#0D9488]/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/3 right-1/3 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] bg-[#9F1239]/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative w-full max-w-sm rounded-xl border border-[#164E53] bg-gradient-to-b from-[#091215] to-[#0D181A] p-8 shadow-2xl">
                <div className="mb-6 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0D9488] via-[#4D7C0F] to-[#9F1239] p-0.5 shadow-[0_0_20px_rgba(20,184,166,0.3)] mb-3">
                        <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#091215]">
                            <span className="font-extrabold text-lg text-[#2DD4BF]">R</span>
                        </div>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-[#2DD4BF] via-[#A3E635] to-[#F43F5E] bg-clip-text text-transparent">RMAST STUDIO</h1>
                    <p className="text-[10px] tracking-widest uppercase text-emerald-400 font-bold mt-1">Luxury Sales Terminal</p>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-[#2DD4BF] focus:outline-none"
                            placeholder="you@rmaststudio.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-[#2DD4BF] focus:outline-none"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/10 px-3 py-2 text-xs text-[#FB7185]">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-gradient-to-r from-[#0D9488] via-[#059669] to-[#4D7C0F] py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-200 hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? "Authenticating..." : "Login to Terminal"}
                    </button>
                </form>
            </div>
        </div>
    );
}