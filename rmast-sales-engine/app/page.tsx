import Link from "next/link";

const CAPABILITIES = [
    {
        title: "Discovery",
        body: "Campaigns sweep a niche across your target locations and pull operational businesses straight from Google Places, deduplicated on the way in.",
        accent: "text-[#2DD4BF]",
        border: "border-[#164E53]",
        bg: "from-[#0E1D1F] to-[#070C0E]",
    },
    {
        title: "Growth Audit",
        body: "Every lead is scored across website, social, lead generation, conversion, SEO and branding, with the specific problems behind each number.",
        accent: "text-[#86EFAC]",
        border: "border-[#1E3A2B]",
        bg: "from-[#121C16] to-[#070C0E]",
    },
    {
        title: "Personalized Demo",
        body: "A complete sample landing page, built against that business's weakest area, ready to share as a link.",
        accent: "text-[#FDA4AF]",
        border: "border-[#4C1D24]",
        bg: "from-[#1F1015] to-[#070C0E]",
    },
    {
        title: "Reviewed Outreach",
        body: "Copy drafted per channel from the real findings, then held for human approval before a single message goes out.",
        accent: "text-[#FDE68A]",
        border: "border-[#423219]",
        bg: "from-[#1B1710] to-[#070C0E]",
    },
];

const SERVICES = [
    "Website Development",
    "Software Development",
    "Social Media Management",
    "Bookkeeping",
    "Virtual Assistant",
];

export default function Home() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-[#070C0E] text-slate-100 antialiased selection:bg-[#2DD4BF]/30 selection:text-[#2DD4BF]">
            <div className="pointer-events-none absolute left-1/4 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#0D9488]/12 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 right-1/4 h-[420px] w-[420px] translate-x-1/2 rounded-full bg-[#9F1239]/12 blur-3xl" />

            <div className="relative mx-auto max-w-4xl px-6 py-20 sm:py-28">
                <header className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0D9488] via-[#4D7C0F] to-[#9F1239] p-0.5 shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#091215]">
                            <span className="text-xs font-extrabold tracking-widest text-[#2DD4BF]">R</span>
                        </div>
                    </div>
                    <div>
                        <p className="bg-gradient-to-r from-[#2DD4BF] via-[#A3E635] to-[#F43F5E] bg-clip-text text-base font-extrabold tracking-wider text-transparent">
                            RMAST STUDIO
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">
                            Sales Engine
                        </p>
                    </div>
                </header>

                <div className="mt-16 border-b border-[#132E32] pb-14">
                    <div className="mb-4 flex items-center gap-2">
                        <span className="h-3.5 w-1 rounded-full bg-[#2DD4BF]" />
                        <span className="text-xs font-extrabold uppercase tracking-widest text-[#2DD4BF]">
                            Internal growth engine
                        </span>
                    </div>
                    <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                        From an unqualified business name to a reviewed, personalized pitch.
                    </h1>
                    <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400">
                        An eight-stage pipeline that finds local businesses, audits their
                        online presence, builds each one a demo, and drafts the outreach —
                        so the only thing left to do is decide who&apos;s worth a
                        conversation.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#0D9488] via-[#059669] to-[#4D7C0F] px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-200 hover:opacity-95 active:scale-[0.98]"
                        >
                            Open the dashboard <span aria-hidden>→</span>
                        </Link>
                        <Link
                            href="/login"
                            className="rounded-lg border border-[#132E32] bg-[#091215] px-5 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-[#164E53] hover:text-white"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>

                <div className="mt-14 grid gap-4 sm:grid-cols-2">
                    {CAPABILITIES.map((capability) => (
                        <div
                            key={capability.title}
                            className={`rounded-xl border ${capability.border} bg-gradient-to-br ${capability.bg} p-6 shadow-lg`}
                        >
                            <h2
                                className={`text-xs font-bold uppercase tracking-wider ${capability.accent}`}
                            >
                                {capability.title}
                            </h2>
                            <p className="mt-2.5 text-sm leading-relaxed text-slate-300">
                                {capability.body}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="mt-14 rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                        What RMAST STUDIO offers
                    </h2>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                        {SERVICES.map((service) => (
                            <span
                                key={service}
                                className="rounded-full border border-[#164E53] bg-[#0E1D1F] px-3 py-1 text-xs font-medium text-slate-300"
                            >
                                {service}
                            </span>
                        ))}
                    </div>
                </div>

                <footer className="mt-16 border-t border-[#132E32] pt-6 text-xs text-slate-600">
                    RMAST STUDIO · Sales Engine
                </footer>
            </div>
        </div>
    );
}
