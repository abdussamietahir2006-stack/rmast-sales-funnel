import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
    GeminiContent,
    GeminiFunctionCall,
    callGemini,
    callGeminiWithTools,
    isQuotaError,
} from "@/lib/ai";
import { COPILOT_TOOLS, executeCopilotTool } from "@/lib/copilot";

/**
 * One endpoint, two modes, chosen per-message by the widget's toggle:
 *
 * - "assistant" (the original, safe default): plain Q&A, same behavior as
 *   the old standalone /api/assistant route it replaced — no tools, so it is
 *   structurally incapable of changing anything, regardless of what's asked.
 * - "copilot": the full agentic tool-call loop — can query the CRM and
 *   trigger the same per-lead pipeline steps already available as buttons
 *   (analyze, enrich, find competitors, generate audit/demo/outreach, move
 *   stage). See lib/copilot.ts for exactly what it can and — deliberately —
 *   cannot do (no sending, no deleting, no touching the auto-send setting).
 *
 * Kept as one route with a mode switch, not two endpoints, so the two modes
 * always share the same data snapshot and history-handling instead of
 * quietly drifting apart over time.
 *
 * Chained actions (e.g. "fully process this lead") can mean several sequential
 * Gemini calls across a few tool iterations, each of which may itself call
 * Gemini again internally (analyze/audit/demo/outreach) — hence the longer
 * duration budget.
 */
export const maxDuration = 280;

const MAX_HISTORY_TURNS = 10;
const MAX_TOOL_ITERATIONS = 8;
const MAX_MESSAGE_LENGTH = 2000;

interface ChatTurn {
    role: "user" | "assistant";
    content: string;
}

function buildSystemInstruction(snapshot: {
    leadCount: number;
    wonCount: number;
    repliedCount: number;
    activeCampaigns: number;
}): string {
    return `
You are the RMAST Copilot, an AI assistant embedded in RMAST STUDIO's internal
sales engine dashboard. You can both answer questions AND take action using
the tools available to you — querying leads, and running pipeline steps
(verify activity, analyze, enrich, find competitors, generate audit/demo/
outreach, change pipeline stage) for a specific lead, by company name.

What you must NEVER do, because no tool exists for it:
- Send a real outreach message to a prospect. Generating a draft is fine and
  expected; sending is always a separate, deliberate operator action (the
  Send button on a lead's page, or the Auto-Send toggle on the Leads page).
- Delete a lead or campaign.
- Change the Auto-Send setting or any other account setting.
If asked to do any of these, explain that it needs to be done from the
dashboard directly, and say where.

Language: fully bilingual in Urdu (script or Roman Urdu) and English — reply
in whichever the user used. Keep replies concise.

When a request names a lead ambiguously or it isn't found, a tool will tell
you so — relay that back to the user rather than guessing.

Current snapshot: ${snapshot.leadCount} total leads, ${snapshot.wonCount} won,
${snapshot.repliedCount} replied, ${snapshot.activeCampaigns} active campaign(s).
`.trim();
}

async function buildSnapshot(db: Awaited<ReturnType<typeof getDb>>) {
    const [leadCount, wonCount, repliedCount, activeCampaigns] = await Promise.all([
        db.collection("leads").countDocuments({}),
        db.collection("leads").countDocuments({ status: "Won" }),
        db.collection("leads").countDocuments({ status: "Replied" }),
        db.collection("campaigns").countDocuments({ status: "Active" }),
    ]);
    return { leadCount, wonCount, repliedCount, activeCampaigns };
}

function buildAssistantPrompt(
    message: string,
    history: ChatTurn[],
    snapshot: { leadCount: number; wonCount: number; repliedCount: number; activeCampaigns: number }
): string {
    const transcript = history
        .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.content}`)
        .join("\n");

    return `
You are the RMAST Assistant, a quick Q&A helper inside RMAST STUDIO's internal
sales engine dashboard. Answer questions about leads, the pipeline, and how
the dashboard works. You only ever answer — you have no ability to change
anything, so never claim to have taken an action.

Language: fully bilingual in Urdu (script or Roman Urdu) and English — reply
in whichever the user used. Keep responses concise, precise, and helpful.

Current data snapshot:
- Total leads: ${snapshot.leadCount}
- Won clients: ${snapshot.wonCount}
- Leads that have replied: ${snapshot.repliedCount}
- Active campaigns: ${snapshot.activeCampaigns}
${transcript ? `\nRecent conversation:\n${transcript}\n` : ""}
User question: ${message}
`.trim();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
        const mode = body.mode === "assistant" ? "assistant" : "copilot";
        const history: ChatTurn[] = Array.isArray(body.history)
            ? body.history.slice(-MAX_HISTORY_TURNS)
            : [];

        if (!message) {
            return NextResponse.json({ error: "message is required" }, { status: 400 });
        }

        if (!process.env.AI_API_KEY) {
            return NextResponse.json(
                {
                    error: `AI API key not configured yet. Add AI_API_KEY to .env.local to enable the ${mode === "assistant" ? "Assistant" : "Copilot"
                        }.`,
                },
                { status: 501 }
            );
        }

        const db = await getDb();
        const snapshot = await buildSnapshot(db);

        if (mode === "assistant") {
            const reply = await callGemini(buildAssistantPrompt(message, history, snapshot));
            return NextResponse.json({
                reply: reply || "I couldn't generate a response for that.",
                actions: [],
            });
        }

        const systemInstruction = buildSystemInstruction(snapshot);

        const contents: GeminiContent[] = [
            ...history.map((turn) => ({
                role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
                parts: [{ text: turn.content }],
            })),
            { role: "user", parts: [{ text: message }] },
        ];

        const actions: { tool: string; args: Record<string, unknown>; summary: string }[] = [];
        let finalText = "";

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            const turn = await callGeminiWithTools(contents, COPILOT_TOOLS, systemInstruction);
            contents.push(turn);

            const calls = turn.parts
                .map((p) => ("functionCall" in p ? p.functionCall : null))
                .filter((c): c is GeminiFunctionCall => c !== null);

            if (calls.length === 0) {
                finalText = turn.parts
                    .map((p) => ("text" in p ? p.text : ""))
                    .join("\n")
                    .trim();
                break;
            }

            const responseParts: GeminiContent["parts"] = [];
            for (const call of calls) {
                const { result, summary } = await executeCopilotTool(db, call.name, call.args || {});
                actions.push({ tool: call.name, args: call.args || {}, summary });
                responseParts.push({
                    functionResponse: {
                        name: call.name,
                        response: { result },
                        ...(call.id ? { id: call.id } : {}),
                    },
                });
            }
            contents.push({ role: "function", parts: responseParts });
        }

        if (!finalText) {
            finalText =
                "That took more steps than I'm allowed in one go — try asking for one part of it at a time.";
        }

        return NextResponse.json({ reply: finalText, actions });
    } catch (error) {
        console.error("[copilot]", error);

        if (isQuotaError(error)) {
            return NextResponse.json(
                { error: "The Copilot is rate limited right now. Try again shortly." },
                { status: 429 }
            );
        }

        return NextResponse.json(
            { error: "The Copilot ran into a problem with that." },
            { status: 500 }
        );
    }
}
