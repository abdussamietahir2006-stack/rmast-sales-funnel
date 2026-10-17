export default function ExportPage() {
    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Export Center</h1>
                <p className="mt-1 text-sm text-slate-400">
                    Download your pipeline data as a CSV file.
                </p>
            </div>

            <div className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-lg">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">
                    All Leads
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    Every lead with its contact details, status, growth score and opt-out
                    flag. Generated demo pages are excluded.
                </p>
                {/* A plain anchor, not <Link>: this is a file download from an
                    API route, and client-side navigation would swallow it. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                    href="/api/leads/export"
                    className="mt-4 inline-block rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:brightness-110"
                >
                    Export All Leads (CSV)
                </a>
            </div>

            <div className="rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#070C0E] p-5 shadow-lg">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">
                    Before you share this file
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    The export contains personal contact data. Under GDPR and similar
                    regimes you remain the controller for it wherever it ends up — keep
                    copies to a minimum and delete them once they&apos;ve served their
                    purpose.
                </p>
            </div>

            <p className="text-xs text-slate-600">
                More export options (per-campaign, per-channel, audits as PDF) can be
                added here later.
            </p>
        </div>
    );
}
