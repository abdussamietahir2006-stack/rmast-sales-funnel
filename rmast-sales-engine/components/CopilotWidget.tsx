"use client";

import { useState, useRef, useEffect } from "react";

interface CopilotAction {
    tool: string;
    args: Record<string, unknown>;
    summary: string;
}

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    actions?: CopilotAction[];
}

/** Turns a tool name into a short, human label for the action log. */
function toolLabel(tool: string): string {
    return tool.replace(/_/g, " ");
}

type Mode = "assistant" | "copilot";

export default function CopilotWidget() {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>("copilot");
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sending, setSending] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceLang, setVoiceLang] = useState<"ur-PK" | "en-US">("ur-PK");
    const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<unknown>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, sending, isRecording]);

    // Handle Speech Recognition for Voice Notes (Urdu + English)
    function toggleVoiceRecording() {
        if (isRecording) {
            if (recognitionRef.current) {
                (recognitionRef.current as { stop: () => void }).stop();
            }
            setIsRecording(false);
            return;
        }

        const SpeechRecognition =
            (window as unknown as { SpeechRecognition: new () => unknown }).SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition: new () => unknown }).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert("Voice recognition is not supported in your browser. Try Google Chrome or Edge.");
            return;
        }

        try {
            const recognition = new SpeechRecognition() as {
                continuous: boolean;
                interimResults: boolean;
                lang: string;
                onstart: () => void;
                onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
                onerror: (e: { error: string }) => void;
                onend: () => void;
                start: () => void;
            };

            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = voiceLang;

            recognition.onstart = () => {
                setIsRecording(true);
            };

            recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                    .map((result) => result[0].transcript)
                    .join("");
                setInput(transcript);
            };

            recognition.onerror = (err) => {
                console.error("Speech recognition error", err);
                setIsRecording(false);
            };

            recognition.onend = () => {
                setIsRecording(false);
            };

            recognition.start();
            recognitionRef.current = recognition;
        } catch (err) {
            console.error("Failed to start speech recognition", err);
            setIsRecording(false);
        }
    }

    // Text to Speech Response Playback (Urdu / English)
    function speakText(text: string, index: number) {
        if (!("speechSynthesis" in window)) {
            alert("Text-to-speech is not supported by your browser.");
            return;
        }

        if (speakingIndex === index) {
            window.speechSynthesis.cancel();
            setSpeakingIndex(null);
            return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);

        // Auto-detect Urdu script vs English for voice pronunciation
        const containsUrdu = /[؀-ۿ]/.test(text);
        utterance.lang = containsUrdu ? "ur-PK" : "en-US";

        utterance.onend = () => setSpeakingIndex(null);
        utterance.onerror = () => setSpeakingIndex(null);

        setSpeakingIndex(index);
        window.speechSynthesis.speak(utterance);
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || sending) return;

        const userMessage = input.trim();
        const historyForRequest = messages.map((m) => ({ role: m.role, content: m.content }));

        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setInput("");
        setSending(true);

        if (isRecording && recognitionRef.current) {
            (recognitionRef.current as { stop: () => void }).stop();
            setIsRecording(false);
        }

        try {
            const res = await fetch("/api/copilot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage, history: historyForRequest, mode }),
            });
            const data = await res.json();

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: res.ok ? data.reply || "..." : data.error || "Something went wrong.",
                    actions: res.ok ? data.actions : undefined,
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Connection error. Please try again." },
            ]);
        }

        setSending(false);
    }

    const copilotSuggestions = [
        { en: "Which leads still need a demo?", ur: "کن لیڈز کو ابھی ڈیمو کی ضرورت ہے؟" },
        { en: "Analyze and draft outreach for [company name]", ur: "[کمپنی کا نام] کا تجزیہ اور آؤٹ ریچ تیار کریں" },
        { en: "What's my win rate?", ur: "کامیابی کی شرح کیا ہے؟" },
    ];
    const assistantSuggestions = [
        { en: "How many leads do I have?", ur: "میرے کتنے لیڈز ہیں؟" },
        { en: "What is my win rate?", ur: "کامیابی کی شرح کیا ہے؟" },
        { en: "Summarize today's activity", ur: "آج کی سرگرمی کا خلاصہ کریں" },
    ];
    const suggestions = mode === "copilot" ? copilotSuggestions : assistantSuggestions;

    return (
        <div className="fixed bottom-6 right-6 z-50 font-sans">
            {open && (
                <div className="mb-4 flex h-[560px] w-96 flex-col overflow-hidden rounded-2xl border border-[#1E293B] bg-gradient-to-b from-[#0B1015] to-[#070C0E] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] animate-in fade-in slide-in-from-bottom-4 duration-300">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#132E32]/80 bg-[#091215] px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#0D9488] via-[#4D7C0F] to-[#9F1239] shadow-[0_0_12px_rgba(20,184,166,0.4)]">
                                <span className="text-xs font-extrabold text-white">R</span>
                                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#091215] bg-emerald-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    RMAST {mode === "copilot" ? "Copilot" : "Assistant"}
                                </p>
                                <p className="text-[10px] text-emerald-400">
                                    {mode === "copilot" ? "Can act on leads, not just answer" : "Quick Q&A — never changes anything"}
                                </p>
                            </div>
                        </div>

                        {/* Language Selector for Voice */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setVoiceLang(voiceLang === "ur-PK" ? "en-US" : "ur-PK")}
                                className="flex items-center gap-1 rounded-full border border-[#132E32] bg-[#070C0E] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#2DD4BF] hover:border-[#2DD4BF]/50 transition-all"
                                title="Toggle Voice Recognition Language"
                            >
                                🌐 {voiceLang === "ur-PK" ? "Urdu (اردو)" : "English"}
                            </button>
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Mode Switch: Assistant (safe, read-only) vs Copilot (can act) */}
                    <div className="flex items-center gap-1 border-b border-[#132E32]/80 bg-[#070C0E] p-1.5">
                        <button
                            onClick={() => setMode("assistant")}
                            className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                                mode === "assistant"
                                    ? "bg-[#0D9488]/20 text-[#2DD4BF] shadow-[0_0_0_1px_rgba(45,212,191,0.4)_inset]"
                                    : "text-slate-500 hover:text-slate-300"
                            }`}
                        >
                            💬 Assistant
                        </button>
                        <button
                            onClick={() => setMode("copilot")}
                            className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                                mode === "copilot"
                                    ? "bg-[#9F1239]/20 text-[#FB7185] shadow-[0_0_0_1px_rgba(251,113,133,0.4)_inset]"
                                    : "text-slate-500 hover:text-slate-300"
                            }`}
                        >
                            ⚡ Copilot
                        </button>
                    </div>

                    {/* Messages Window */}
                    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                        {messages.length === 0 && (
                            <div className="space-y-3">
                                <div className="rounded-xl border border-[#132E32]/60 bg-[#091215]/80 p-3 text-xs leading-relaxed text-slate-400">
                                    <p className="font-semibold text-white mb-1">
                                        Assalamu Alaikum! / Welcome! 🎙️
                                    </p>
                                    {mode === "copilot" ? (
                                        <>
                                            Ask me about your pipeline, or ask me to act on a lead by
                                            name — analyze it, find competitors, generate its demo or
                                            outreach draft, move its stage. I can&apos;t send a real
                                            message or delete anything; those stay as your own
                                            deliberate action on the dashboard.
                                        </>
                                    ) : (
                                        <>
                                            Ask me anything about your leads or pipeline — I only
                                            answer, I never change anything. Switch to{" "}
                                            <strong className="text-[#FB7185]">Copilot</strong> above
                                            when you want me to actually do something.
                                        </>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    {suggestions.map((s, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setInput(s.en)}
                                            className="block w-full rounded-lg border border-[#1E293B] bg-white/[0.02] px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:border-[#0D9488]/50 hover:bg-[#0D9488]/10 hover:text-white"
                                        >
                                            <span>{s.en}</span>
                                            <span className="block text-[10px] text-slate-500 font-normal dir-rtl mt-0.5">
                                                {s.ur}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className="group relative max-w-[85%]">
                                    {m.actions && m.actions.length > 0 && (
                                        <div className="mb-1.5 space-y-1">
                                            {m.actions.map((a, ai) => (
                                                <div
                                                    key={ai}
                                                    className="flex items-start gap-1.5 rounded-lg border border-[#164E53]/50 bg-[#0E1D1F]/60 px-2.5 py-1.5 text-[10px] leading-relaxed text-[#86EFAC]"
                                                >
                                                    <span className="shrink-0">🔧</span>
                                                    <span>
                                                        <span className="font-bold uppercase tracking-wider text-[#2DD4BF]">
                                                            {toolLabel(a.tool)}
                                                        </span>{" "}
                                                        — {a.summary}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div
                                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                            m.role === "user"
                                                ? "rounded-br-sm bg-gradient-to-br from-[#0D9488] to-[#0F766E] text-white"
                                                : "rounded-bl-sm border border-[#1E293B] bg-white/[0.03] text-slate-200"
                                        }`}
                                    >
                                        {m.content}
                                    </div>
                                    {m.role === "assistant" && (
                                        <button
                                            onClick={() => speakText(m.content, i)}
                                            className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-[#2DD4BF] transition-colors"
                                            title="Listen to response (Audio Voice Note)"
                                        >
                                            {speakingIndex === i ? "⏹️ Stop" : "🔊 Listen (آواز سنیں)"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {sending && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[#1E293B] bg-white/[0.03] px-4 py-3">
                                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2DD4BF] [animation-delay:-0.3s]" />
                                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2DD4BF] [animation-delay:-0.15s]" />
                                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2DD4BF]" />
                                </div>
                            </div>
                        )}

                        {isRecording && (
                            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
                                <span className="h-2 w-2 animate-ping rounded-full bg-rose-500" />
                                <span>
                                    Recording Voice Note in{" "}
                                    <strong>{voiceLang === "ur-PK" ? "Urdu (اردو)" : "English"}</strong>...
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Input Controls */}
                    <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-[#132E32]/80 bg-[#091215] p-3">
                        {/* Mic Voice Note Button */}
                        <button
                            type="button"
                            onClick={toggleVoiceRecording}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                                isRecording
                                    ? "border-rose-500 bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse"
                                    : "border-[#1E293B] bg-white/[0.03] text-slate-300 hover:border-[#0D9488]/60 hover:text-white"
                            }`}
                            title={isRecording ? "Stop Voice Recording" : `Record Voice Note in ${voiceLang === "ur-PK" ? "Urdu" : "English"}`}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" strokeLinejoin="round" />
                                <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                                <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={isRecording ? "Listening..." : voiceLang === "ur-PK" ? "Ask or tell me what to do... (بولیے یا لکھیے)" : "Ask, or tell me what to do..."}
                            className="flex-1 rounded-xl border border-[#1E293B] bg-white/[0.02] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-[#0D9488]/60"
                        />

                        {/* Send Button */}
                        <button
                            type="submit"
                            disabled={sending || !input.trim()}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0D9488] to-[#0F766E] text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M22 2 11 13" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M22 2 15 22l-4-9-9-4Z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </form>
                </div>
            )}

            <button
                onClick={() => setOpen(!open)}
                className="group relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#0D9488] via-[#4D7C0F] to-[#9F1239] text-white shadow-[0_8px_30px_rgba(20,184,166,0.4)] transition-transform hover:scale-105"
            >
                {!open && (
                    <span className="absolute h-full w-full animate-ping rounded-full bg-[#0D9488]/40" />
                )}
                {open ? (
                    <span className="text-xl">✕</span>
                ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
        </div>
    );
}
