import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLead } from "@/lib/pipeline";
import { callGeminiJson, isQuotaError } from "@/lib/ai";

interface TalkingPoints {
    talkingPoints: string[];
    objections: { objection: string; response: string }[];
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = await getDb();
        const lead = await getLead(db, id);
        if (!lead) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        const competitors = (lead.competitors || []) as {
            name: string;
            strength: string;
        }[];

        let talkingPoints: string[] | null = null;
        let objections: TalkingPoints["objections"] | null = null;
        let warning: string | undefined;

        if (process.env.AI_API_KEY && lead.growthScore) {
            try {
                const result = await callGeminiJson<TalkingPoints>(
                    `
Prepare a sales rep for a discovery call with this business on behalf of
RMAST STUDIO (services: Website Development, Software Development, Social
Media Management, Bookkeeping, Virtual Assistant).

Business: ${lead.companyName} (${lead.niche} in ${lead.location}, ${lead.market})
Growth score: ${lead.growthScore}/100
Score breakdown: ${JSON.stringify(lead.scores || {})}
Problems found: ${(lead.problems || []).join("; ") || "none recorded"}
Recommended fixes: ${(lead.recommendations || []).join("; ") || "none recorded"}
Local competitors: ${competitors.map((c) => `${c.name} (${c.strength})`).join("; ") || "none found"}

Give 4 specific talking points grounded in the findings above (no generic
sales filler), and 3 objections this specific business is likely to raise
with a short, honest response to each.

Return JSON exactly:
{ "talkingPoints": ["point 1", "point 2", "point 3", "point 4"],
  "objections": [{ "objection": "...", "response": "..." }] }
`.trim()
                );

                talkingPoints = Array.isArray(result.talkingPoints)
                    ? result.talkingPoints
                    : null;
                objections = Array.isArray(result.objections) ? result.objections : null;
            } catch (error) {
                warning = isQuotaError(error)
                    ? "AI talking points skipped: Gemini quota reached."
                    : "AI talking points could not be generated.";
            }
        }

        return NextResponse.json({
            prep: {
                companyName: lead.companyName,
                growthScore: lead.growthScore || null,
                topProblems: (lead.problems || []).slice(0, 3),
                recommendations: lead.recommendations || [],
                competitors,
                talkingPoints,
                objections,
                warning,
            },
        });
    } catch (error) {
        console.error("[leads/call-prep]", error);
        return NextResponse.json({ error: "Could not build call prep" }, { status: 500 });
    }
}
