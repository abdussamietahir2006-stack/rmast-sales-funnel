"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function DemoPage() {
    const params = useParams();
    const [html, setHtml] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDemo() {
            const res = await fetch(`/api/demo/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setHtml(data.html);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        }
        fetchDemo();
    }, [params.id]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#070C0E] text-slate-400">
                <div className="flex items-center gap-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2DD4BF] border-t-transparent" />
                    <p className="text-sm font-medium tracking-wide">Loading demo...</p>
                </div>
            </div>
        );
    }

    if (notFound || !html) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#070C0E] text-slate-400">
                <div className="rounded-xl border border-[#132E32] bg-[#091215] p-8 text-center shadow-lg">
                    <p className="text-sm font-medium text-slate-300">
                        This demo could not be found.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <iframe
            srcDoc={html}
            title="Personalized Demo"
            className="h-screen w-full border-0"
            // The generated page needs `allow-scripts`: the demo prompt asks for
            // Intersection Observer scroll reveals, smooth-scroll navigation and
            // a mobile hamburger menu, none of which ran before.
            //
            // `allow-same-origin` is deliberately absent. Pairing it with
            // allow-scripts would give AI-generated markup a same-origin
            // document — it could then reach this app's cookies and DOM, which
            // defeats the sandbox entirely. Without it the frame gets an opaque
            // origin: scripts run, but nothing escapes.
            sandbox="allow-scripts allow-forms"
        />
    );
}