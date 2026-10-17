"use client";
import CopilotWidget from "@/components/CopilotWidget";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
    { href: "/dashboard/leads", label: "Leads", accent: "teal" },
    { href: "/dashboard/whatsapp", label: "WhatsApp", accent: "emerald" },
    { href: "/dashboard/instagram", label: "Instagram", accent: "maroon" },
    { href: "/dashboard/facebook", label: "Facebook", accent: "indigo" },
    { href: "/dashboard/email", label: "Email", accent: "teal" },
    { href: "/dashboard/linkedin", label: "LinkedIn", accent: "olive" },
    { href: "/dashboard/pipeline", label: "Pipeline", accent: "gold" },
    { href: "/dashboard/calendar", label: "Calendar", accent: "maroon" },
    { href: "/dashboard/best-time", label: "Best Time to Contact", accent: "teal" },
    { href: "/dashboard/sentiment", label: "Reply Sentiment", accent: "emerald" },
    { href: "/dashboard/forecast", label: "Pipeline Forecast", accent: "gold" },
    { href: "/dashboard/win-loss", label: "Win / Loss Reasons", accent: "maroon" },
    { href: "/dashboard/goals", label: "Goals", accent: "teal" },
    { href: "/dashboard/campaigns", label: "Campaigns", accent: "olive" },
    { href: "/dashboard/call-prep", label: "Call Prep", accent: "emerald" },
    { href: "/dashboard/call-notes", label: "Call Notes", accent: "maroon" },
    { href: "/dashboard/source-roi", label: "Lead Source ROI", accent: "teal" },
    { href: "/dashboard/duplicates", label: "Duplicate Leads", accent: "gold" },
    { href: "/dashboard/notes", label: "Notes & Tags", accent: "olive" },
    { href: "/dashboard/digest", label: "Daily Digest", accent: "maroon" },
    { href: "/dashboard/export", label: "Export Center", accent: "teal" },
    { href: "/dashboard/activity", label: "Activity Feed", accent: "emerald" },
    { href: "/dashboard/tasks", label: "Task Assignment", accent: "gold" },
    { href: "/dashboard/custom", label: "Custom Features", accent: "indigo" },
    { href: "/dashboard/settings", label: "Settings", accent: "slate" },
];

interface CustomFeature {
    name: string;
    slug: string;
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [customFeatures, setCustomFeatures] = useState<CustomFeature[]>([]);

    async function fetchCustomFeatures() {
        const res = await fetch("/api/custom-features");
        if (res.ok) {
            const data = await res.json();
            setCustomFeatures(data.features || []);
        }
    }

    useEffect(() => {
        fetchCustomFeatures();
        window.addEventListener("custom-features-updated", fetchCustomFeatures);
        return () =>
            window.removeEventListener("custom-features-updated", fetchCustomFeatures);
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-[#070C0E] text-slate-100 antialiased selection:bg-[#14B8A6]/30 selection:text-[#2DD4BF]">
            <aside className="w-64 shrink-0 h-full overflow-y-auto border-r border-[#132E32]/80 bg-[#091215] p-5 shadow-2xl">
                {/* Brand Header with Rich Multi-Jewel Gradient */}
                <div className="mb-8 flex items-center gap-3 px-2">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0D9488] via-[#4D7C0F] to-[#9F1239] p-0.5 shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#091215]">
                            <span className="font-extrabold text-xs tracking-widest text-[#2DD4BF]">R</span>
                        </div>
                    </div>
                    <div>
                        <h2 className="text-base font-extrabold tracking-wider bg-gradient-to-r from-[#2DD4BF] via-[#A3E635] to-[#F43F5E] bg-clip-text text-transparent">
                            RMAST STUDIO
                        </h2>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/80">Luxury Sales Engine</p>
                    </div>
                </div>

                <nav className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`block text-sm py-2.5 px-3.5 transition-all duration-200 ${isActive
                                    ? "border-l-2 border-[#2DD4BF] bg-gradient-to-r from-[#0D9488]/20 via-[#4D7C0F]/10 to-transparent text-white font-semibold rounded-r-lg shadow-sm"
                                    : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] rounded-lg"
                                    }`}
                            >
                                <span className="flex items-center gap-2.5">
                                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-[#2DD4BF] shadow-[0_0_8px_#2DD4BF]" : "bg-slate-600"
                                        }`} />
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}

                    {customFeatures.length > 0 && (
                        <>
                            <div className="mt-5 mb-1 px-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                Your Custom Pages
                            </div>
                            {customFeatures.map((f) => {
                                const href = `/dashboard/custom/${f.slug}`;
                                const isActive = pathname === href;
                                return (
                                    <Link
                                        key={f.slug}
                                        href={href}
                                        className={`block text-sm py-2.5 px-3.5 transition-all duration-200 ${isActive
                                            ? "border-l-2 border-[#2DD4BF] bg-gradient-to-r from-[#0D9488]/20 via-[#4D7C0F]/10 to-transparent text-white font-semibold rounded-r-lg shadow-sm"
                                            : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] rounded-lg"
                                            }`}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span
                                                className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-[#2DD4BF] shadow-[0_0_8px_#2DD4BF]" : "bg-slate-600"
                                                    }`}
                                            />
                                            {f.name}
                                        </span>
                                    </Link>
                                );
                            })}
                        </>
                    )}
                </nav>
            </aside>
            <main className="flex-1 h-full bg-[#070C0E] p-8 overflow-y-auto">{children}</main>
            <CopilotWidget />
        </div>
    );
}