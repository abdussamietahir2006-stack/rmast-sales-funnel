/**
 * Gemini client, with a chain of official free-tier fallback providers.
 *
 * A full pipeline run is 11-17 Gemini calls per lead, and the cron processes a
 * batch of leads back to back, so this module has to survive rate limiting
 * rather than treat it as fatal. Plain (non-search) calls go through
 * `requestGemini()`, which adds a concurrency gate, request pacing, a
 * timeout, and retry with backoff — and when Gemini's free tier is genuinely
 * exhausted (not just slow), `callGemini()` walks a chain of other providers
 * (OpenRouter, Groq, Cerebras, Cohere, then OpenAI — see FALLBACK_PROVIDERS
 * below) until one of them answers.
 *
 * Every provider here is that provider's own official, documented API — the
 * first four are free tiers, the last (OpenAI) is billed from the first
 * call and placed last for exactly that reason. None of them is a scraped or
 * unofficial "unlimited key" reseller — those exist too, get pitched
 * constantly, and are the kind of thing this app specifically avoids:
 * routing real prospect and business data through an unaccountable
 * third-party proxy is a genuine data-exposure risk, whoever's model is
 * supposedly on the other end, and such keys are liable to vanish without
 * warning mid-pipeline. Each endpoint/model id below was verified live
 * against the real provider rather than assumed — free-tier catalogs (and
 * sometimes whole programs — GitHub Models was retired outright in
 * mid-2026) change without notice, and a stale entry just fails and falls
 * through to the next provider, which is the safe failure mode here.
 *
 * Search-grounded calls (`callGeminiWithSearch`) do NOT fall back to any of
 * this — none of these providers has an equivalent to Gemini's built-in
 * Google Search grounding, and guessing without a real search would
 * reintroduce exactly the fabricated-data risk this app guards against
 * elsewhere (see lib/pipeline.ts's competitor sanitization).
 */

const MODEL = process.env.AI_MODEL || "gemini-3.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Prompts above this are truncated — a runaway scrape must not blow the quota. */
const MAX_PROMPT_CHARS = 24_000;
/** Simultaneous in-flight Gemini calls per process. */
const MAX_CONCURRENCY = 2;
/** Minimum gap between the start of two calls, to stay under per-minute limits. */
const MIN_INTERVAL_MS = 350;
const REQUEST_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 90_000);
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1_500;
/** Never sleep longer than this on a single retry — the caller has a deadline. */
const MAX_BACKOFF_MS = 20_000;

import { publicAppUrl } from "@/lib/app-url";

export class AiError extends Error {
    readonly status?: number;
    readonly retryable: boolean;

    constructor(message: string, status?: number, retryable = false) {
        super(message);
        this.name = "AiError";
        this.status = status;
        this.retryable = retryable;
    }
}

/** True for the "you've hit your Gemini quota" family of failures. */
export function isQuotaError(error: unknown): boolean {
    if (error instanceof AiError) return error.status === 429;
    const message = String(error);
    return message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
}

// --- Concurrency gate + pacing -------------------------------------------

let active = 0;
let lastStartedAt = 0;
const waiting: (() => void)[] = [];

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot() {
    if (active >= MAX_CONCURRENCY) {
        await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;

    const sinceLast = Date.now() - lastStartedAt;
    if (sinceLast < MIN_INTERVAL_MS) {
        await sleep(MIN_INTERVAL_MS - sinceLast);
    }
    lastStartedAt = Date.now();
}

function releaseSlot() {
    active--;
    const next = waiting.shift();
    if (next) next();
}

// --- Core request ---------------------------------------------------------

function truncate(prompt: string): string {
    if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
    return `${prompt.slice(0, MAX_PROMPT_CHARS)}\n\n[truncated]`;
}

function backoffFor(attempt: number, retryAfterHeader: string | null): number {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
    }
    const exponential = BASE_BACKOFF_MS * 2 ** attempt;
    const jitter = Math.random() * BASE_BACKOFF_MS;
    return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

async function requestGemini(prompt: string, useSearch: boolean): Promise<string> {
    if (!process.env.AI_API_KEY) {
        throw new AiError("AI_API_KEY is not configured", 501);
    }

    const body = JSON.stringify({
        contents: [{ parts: [{ text: truncate(prompt) }] }],
        ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
    });

    let lastError: AiError = new AiError("Gemini request never ran");

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await acquireSlot();
        let res: Response;
        try {
            res = await fetch(
                `${API_BASE}/${MODEL}:generateContent?key=${process.env.AI_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                }
            );
        } catch (error) {
            // Network failure or timeout — both worth one more try.
            lastError = new AiError(`Gemini request failed: ${String(error)}`, undefined, true);
            releaseSlot();
            if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffFor(attempt, null));
            continue;
        }

        if (res.ok) {
            releaseSlot();
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }

        const errorText = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new AiError(
            `Gemini API error: ${res.status} ${errorText}`,
            res.status,
            retryable
        );
        const retryAfter = res.headers.get("retry-after");
        releaseSlot();

        if (!retryable) throw lastError;
        if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffFor(attempt, retryAfter));
    }

    throw lastError;
}

// --- Fallback providers (free tier) ----------------------------------------
//
// Only used for plain calls, and only when Gemini has genuinely failed (its
// own retries in requestGemini() are already exhausted by the time any of
// this runs). Each is a couple of quick retries, not the full patience
// Gemini gets as the primary — they're backups, tried in order, not a peer
// pool to load-balance across.

/** Shared retry loop for one fallback provider's HTTP attempt(s). Returns the
 *  parsed JSON body; each provider's own wrapper extracts its own response
 *  shape, since that differs (OpenAI-style `choices[]` vs. Cohere's `message`). */
async function fetchFallbackJson(
    providerName: string,
    url: string,
    init: RequestInit
): Promise<unknown> {
    const maxAttempts = 2;
    let lastError: AiError = new AiError(`${providerName} fallback never ran`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await acquireSlot();
        let res: Response;
        try {
            res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch (error) {
            lastError = new AiError(`${providerName} request failed: ${String(error)}`, undefined, true);
            releaseSlot();
            if (attempt < maxAttempts - 1) await sleep(backoffFor(attempt, null));
            continue;
        }

        if (res.ok) {
            releaseSlot();
            return res.json();
        }

        const errorText = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new AiError(`${providerName} API error: ${res.status} ${errorText}`, res.status, retryable);
        const retryAfter = res.headers.get("retry-after");
        releaseSlot();

        if (!retryable) throw lastError;
        if (attempt < maxAttempts - 1) await sleep(backoffFor(attempt, retryAfter));
    }

    throw lastError;
}

function jsonHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
    return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extra,
    };
}

/**
 * OpenRouter — a broker for other providers' official free tiers. Its free
 * catalog rotates as providers add and retire zero-cost offerings, so the
 * model is configurable rather than hardcoded — check
 * https://openrouter.ai/models?max_price=0 if the default has been retired.
 */
async function callOpenRouter(prompt: string): Promise<string> {
    const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free";
    const appUrl = publicAppUrl();

    const data = (await fetchFallbackJson(
        "OpenRouter",
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",
            headers: jsonHeaders(process.env.OPENROUTER_API_KEY!, {
                // Optional attribution headers OpenRouter recommends — no
                // functional effect, just good citizenship.
                ...(appUrl ? { "HTTP-Referer": appUrl } : {}),
                "X-Title": "RMAST Sales Engine",
            }),
            body: JSON.stringify({ model, messages: [{ role: "user", content: truncate(prompt) }] }),
        }
    )) as { choices?: { message?: { content?: string } }[] };

    return data.choices?.[0]?.message?.content || "";
}

/** Groq — genuinely free (not trial-credit) tier, OpenAI-compatible, fast. */
async function callGroq(prompt: string): Promise<string> {
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    const data = (await fetchFallbackJson(
        "Groq",
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: jsonHeaders(process.env.GROQ_API_KEY!),
            body: JSON.stringify({ model, messages: [{ role: "user", content: truncate(prompt) }] }),
        }
    )) as { choices?: { message?: { content?: string } }[] };

    return data.choices?.[0]?.message?.content || "";
}

/**
 * Cerebras — OpenAI-compatible, but note this is a one-time $5 trial credit
 * rather than a persistent no-cost tier, so it's placed after the providers
 * with genuinely unlimited-in-time free allowances and will eventually stop
 * working on its own once spent.
 */
async function callCerebras(prompt: string): Promise<string> {
    const model = process.env.CEREBRAS_MODEL || "gpt-oss-120b";

    const data = (await fetchFallbackJson(
        "Cerebras",
        "https://api.cerebras.ai/v1/chat/completions",
        {
            method: "POST",
            headers: jsonHeaders(process.env.CEREBRAS_API_KEY!),
            body: JSON.stringify({ model, messages: [{ role: "user", content: truncate(prompt) }] }),
        }
    )) as { choices?: { message?: { content?: string } }[] };

    return data.choices?.[0]?.message?.content || "";
}

/**
 * Cohere — a persistent free trial key, but capped at only 1,000 calls a
 * month (not a day), so it's the last resort: worth having, not worth
 * spending on anything the earlier providers could have handled. Its v2 API
 * has a distinct response shape from the OpenAI-compatible providers above.
 */
async function callCohere(prompt: string): Promise<string> {
    const model = process.env.COHERE_MODEL || "command-a-plus-05-2026";

    const data = (await fetchFallbackJson("Cohere", "https://api.cohere.com/v2/chat", {
        method: "POST",
        headers: jsonHeaders(process.env.COHERE_API_KEY!),
        body: JSON.stringify({ model, messages: [{ role: "user", content: truncate(prompt) }] }),
    })) as { message?: { content?: { text?: string }[] } };

    return data.message?.content?.[0]?.text || "";
}

/**
 * OpenAI — real, official, verified working against the live API on this
 * account. Placed last, deliberately: unlike the four above, OpenAI's API
 * has no free tier at all — it's billed per token from the very first call.
 * This is the "everything free has failed" safety net, not a peer with the
 * others, which is also why it defaults to the cheapest current tier rather
 * than a flagship model.
 */
async function callOpenAI(prompt: string): Promise<string> {
    const model = process.env.OPENAI_MODEL || "gpt-5.4-nano";

    const data = (await fetchFallbackJson(
        "OpenAI",
        "https://api.openai.com/v1/chat/completions",
        {
            method: "POST",
            headers: jsonHeaders(process.env.OPENAI_API_KEY!),
            body: JSON.stringify({ model, messages: [{ role: "user", content: truncate(prompt) }] }),
        }
    )) as { choices?: { message?: { content?: string } }[] };

    return data.choices?.[0]?.message?.content || "";
}

interface FallbackProvider {
    name: string;
    configured: () => boolean;
    call: (prompt: string) => Promise<string>;
}

/** Tried in this order — most generous and highest-quality genuinely-free
 *  tiers first, the trial-credit and hard-monthly-cap ones next, and the
 *  billed-from-the-first-call one absolutely last. */
const FALLBACK_PROVIDERS: FallbackProvider[] = [
    { name: "OpenRouter", configured: () => !!process.env.OPENROUTER_API_KEY, call: callOpenRouter },
    { name: "Groq", configured: () => !!process.env.GROQ_API_KEY, call: callGroq },
    { name: "Cerebras", configured: () => !!process.env.CEREBRAS_API_KEY, call: callCerebras },
    { name: "Cohere", configured: () => !!process.env.COHERE_API_KEY, call: callCohere },
    { name: "OpenAI", configured: () => !!process.env.OPENAI_API_KEY, call: callOpenAI },
];

// --- Public API -----------------------------------------------------------

export async function callGemini(prompt: string): Promise<string> {
    try {
        return await requestGemini(prompt, false);
    } catch (geminiError) {
        const configured = FALLBACK_PROVIDERS.filter((p) => p.configured());
        if (configured.length === 0) throw geminiError;

        console.warn("[ai] Gemini failed, trying fallback providers:", String(geminiError));

        for (const provider of configured) {
            try {
                const text = await provider.call(prompt);
                console.warn(`[ai] Recovered via ${provider.name} fallback.`);
                return text;
            } catch (fallbackError) {
                console.warn(`[ai] ${provider.name} fallback failed:`, String(fallbackError));
            }
        }

        // Every configured fallback failed too — surface Gemini's error since
        // that's the one isQuotaError() and every caller's error message
        // already know how to explain to the operator.
        throw geminiError;
    }
}

/**
 * Uses Gemini's built-in Google Search grounding tool, so it can find real,
 * current, public information (e.g. a business's real social media profile
 * URLs, or real local competitors) instead of just generating text from its
 * training data. Grounded calls have a much tighter free-tier quota, and
 * deliberately have no fallback — see the module doc comment.
 */
export async function callGeminiWithSearch(prompt: string): Promise<string> {
    return requestGemini(prompt, true);
}

function parseJson<T>(text: string): T {
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        // Models sometimes wrap JSON in a sentence — salvage the outermost
        // object or array rather than failing the whole pipeline step.
        const start = cleaned.search(/[{[]/);
        const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
        if (start !== -1 && end > start) {
            return JSON.parse(cleaned.slice(start, end + 1)) as T;
        }
        throw new AiError("Gemini did not return valid JSON");
    }
}

const JSON_SUFFIX =
    "\n\nRespond ONLY with valid JSON, no markdown formatting, no backticks, no preamble.";

export async function callGeminiJson<T>(prompt: string): Promise<T> {
    try {
        return parseJson<T>(await callGemini(prompt + JSON_SUFFIX));
    } catch (error) {
        // Long structured responses (the audit, the demo brief) occasionally
        // come back with one malformed element. That's a sampling fluke, not
        // a pattern, so one fresh attempt nearly always succeeds. Quota and
        // network errors are rethrown untouched.
        if (!(error instanceof SyntaxError) && !(error instanceof AiError && /valid JSON/.test(error.message))) {
            throw error;
        }
        return parseJson<T>(await callGemini(prompt + JSON_SUFFIX));
    }
}

export async function callGeminiSearchJson<T>(prompt: string): Promise<T> {
    return parseJson<T>(await callGeminiWithSearch(prompt + JSON_SUFFIX));
}

// --- Tool calling (function calling) ---------------------------------------
//
// Powers the dashboard Copilot (lib/copilot.ts, /api/copilot) so it can query
// and act on the CRM, not just answer questions about it. Kept entirely
// separate from requestGemini() above — a different request/response shape
// (a running Content[] conversation, not a single prompt string) — so the
// plain-text path already proven across every pipeline step this session is
// never at risk from changes here. Empirically verified against the real API
// (not just documentation, which gave inconsistent answers across fetches):
// tools go under `functionDeclarations`, and a tool result is sent back as a
// Content with role "function" holding a `functionResponse` part.
//
// No fallback chain here — OpenRouter/Groq/Cerebras/Cohere aren't guaranteed
// to speak the same function-calling schema, and building/verifying that for
// four more providers is real, separate scope. If Gemini is unavailable, the
// copilot errors clearly rather than silently degrading to a worse provider
// mid-tool-call.

export interface ToolDeclaration {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface GeminiFunctionCall {
    name: string;
    args: Record<string, unknown>;
    id?: string;
}

export type GeminiPart =
    | { text: string }
    | { functionCall: GeminiFunctionCall }
    | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } };

export interface GeminiContent {
    role: "user" | "model" | "function";
    parts: GeminiPart[];
}

/**
 * One turn of a tool-calling conversation: sends the full running history
 * plus the available tools and an optional system instruction, and returns
 * the model's next Content turn — which may hold plain text, one or more
 * functionCall parts, or both.
 */
export async function callGeminiWithTools(
    contents: GeminiContent[],
    tools: ToolDeclaration[],
    systemInstruction?: string
): Promise<GeminiContent> {
    if (!process.env.AI_API_KEY) {
        throw new AiError("AI_API_KEY is not configured", 501);
    }

    const body = JSON.stringify({
        contents,
        tools: [{ functionDeclarations: tools }],
        ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
    });

    let lastError: AiError = new AiError("Gemini tool-call request never ran");

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await acquireSlot();
        let res: Response;
        try {
            res = await fetch(
                `${API_BASE}/${MODEL}:generateContent?key=${process.env.AI_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                }
            );
        } catch (error) {
            lastError = new AiError(`Gemini request failed: ${String(error)}`, undefined, true);
            releaseSlot();
            if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffFor(attempt, null));
            continue;
        }

        if (res.ok) {
            releaseSlot();
            const data = await res.json();
            const content = data.candidates?.[0]?.content;
            if (!content) {
                throw new AiError("Gemini returned no content for the tool-call turn");
            }
            return content as GeminiContent;
        }

        const errorText = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new AiError(`Gemini API error: ${res.status} ${errorText}`, res.status, retryable);
        const retryAfter = res.headers.get("retry-after");
        releaseSlot();

        if (!retryable) throw lastError;
        if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffFor(attempt, retryAfter));
    }

    throw lastError;
}
