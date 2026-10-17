export default function TasksPage() {
    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Task Assignment</h1>
                <p className="mt-1 text-sm text-slate-400">
                    This becomes useful once you add team members to RMAST STUDIO.
                </p>
            </div>

            <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[#164E53] bg-[#0E1D1F]">
                    <span className="text-[#2DD4BF]">◷</span>
                </div>
                <p className="text-sm font-medium text-slate-200">No team members yet</p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                    The engine currently runs as a single operator. Once more people are
                    added, you&apos;ll be able to assign specific leads or follow-ups to
                    them here.
                </p>
            </div>
        </div>
    );
}
