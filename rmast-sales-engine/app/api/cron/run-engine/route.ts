import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Db } from "mongodb";
import { getDb } from "@/lib/db";
import { discoverLeads } from "@/lib/places";
import {
    Lead,
    analyzeLead,
    enrichLead,
    findCompetitorsForLead,
    generateAudit,
    generateDemo,
    generateOutreach,
    getLead,
    verifyLeadActivity,
} from "@/lib/pipeline";
import { AUTO_SEND_CHANNELS, isSuppressed, sendMessage } from "@/lib/send";

/**
 * The scheduled engine run.
 *
 * This used to drive the pipeline by fetching its own API six times per lead —
 * sixty chained serverless invocations inside one request, which would not
 * finish inside any plausible function timeout. It now calls the pipeline
 * functions directly, shares one database connection, and stops starting new
 * leads when it runs out of time rather than being killed mid-lead.
 */

export const maxDuration = 300;

/**
 * A ceiling on how many "New" leads to even fetch and attempt, not a target
 * to hit — the real limit is TIME_BUDGET_MS below. A full pipeline pass on
 * one lead (verify, analyze, enrich, competitors, audit, demo, up to 10
 * outreach drafts — 11-17 Gemini calls) realistically takes 40-70+ seconds,
 * so this run completes something like 5-10 of these regardless of the
 * number below; it exists so a day with unusually fast leads (e.g. several
 * skipped as inactive before any AI is spent) can pick up more than that
 * without the loop stopping artificially early. On the once-daily schedule
 * this route now runs on (Hobby-plan cron can't go more often), this is the
 * only chance per day to make progress, hence the higher ceiling than
 * before.
 */
const BATCH_SIZE = 25;
/** Stop starting new leads once this much of the budget is gone. */
const TIME_BUDGET_MS = (maxDuration - 45) * 1000;

function authorize(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const provided = request.headers.get("authorization") || "";
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);

    return a.length === b.length && timingSafeEqual(a, b);
}

async function runDiscovery(db: Db, log: string[]): Promise<void> {
    const activeCampaigns = await db
        .collection("campaigns")
        .find({ status: "Active" })
        .toArray();

    if (activeCampaigns.length === 0) return;

    if (!process.env.GOOGLE_PLACES_API_KEY) {
        log.push(
            `Skipped discovery for ${activeCampaigns.length} active campaign(s): Google Places API key not configured.`
        );
        return;
    }

    for (const campaign of activeCampaigns) {
        const locations: string[] = campaign.locations || [];
        if (locations.length === 0) continue;

        const perLocationCount = Math.ceil(
            (campaign.leadCountPerRun || 100) / locations.length
        );

        for (const location of locations) {
            try {
                const result = await discoverLeads(db, {
                    campaignId: campaign._id.toString(),
                    niche: campaign.niche,
                    country: campaign.country,
                    state: location,
                    count: perLocationCount,
                });
                log.push(
                    `Discovery for "${campaign.name}" in ${location}: ${result.inserted} new, ${result.skippedDuplicates} duplicate(s).`
                );
            } catch (error) {
                log.push(
                    `Discovery for "${campaign.name}" in ${location} failed: ${String(error)}`
                );
            }
        }
    }
}

async function autoSend(db: Db, leadId: string, log: string[]): Promise<void> {
    const fresh = await getLead(db, leadId);
    if (!fresh) return;

    const name = fresh.companyName;

    if (fresh.contactMethod !== "direct") {
        log.push(
            `${name}: fully processed, routed to manual outreach (${fresh.contactMethod}).`
        );
        return;
    }

    if (await isSuppressed(db, fresh)) {
        log.push(`${name}: fully processed, but the lead has opted out — not contacted.`);
        return;
    }

    // One switch, in Settings: auto-send on means every eligible lead's
    // outreach goes out unreviewed the moment it's generated. Off means
    // nothing here ever sends — the operator sends by hand, per message,
    // from the lead's own page instead.
    const settings = await db.collection("settings").findOne({});
    if (!settings?.autoSendEnabled) {
        log.push(
            `${name}: fully processed and awaiting manual send (auto-send is off in Settings).`
        );
        return;
    }

    const messages = (fresh.outreachMessages || {}) as Record<string, string>;
    const sent: string[] = [];

    for (const channel of AUTO_SEND_CHANNELS) {
        const content = messages[channel];
        if (!content) continue;

        const result = await sendMessage(db, fresh, channel, content);
        if (result.ok) {
            sent.push(channel);
        } else if (!result.notConfigured) {
            log.push(`${name}: ${channel} send failed — ${result.message}`);
        }
    }

    log.push(
        sent.length > 0
            ? `${name}: fully processed and sent via ${sent.join(", ")}.`
            : `${name}: fully processed, but no channel was able to send.`
    );
}

async function runLead(db: Db, lead: Lead, log: string[]): Promise<void> {
    const id = lead._id.toString();
    const name = lead.companyName;

    // Catches a lead whose Google Places listing never got updated after the
    // business actually closed — reject before spending anything further on
    // it, not after. A failed (not "inactive") check never blocks the lead;
    // only a confident "inactive" verdict does.
    const verification = await verifyLeadActivity(db, lead);
    if (verification.ok && verification.data?.verdict === "inactive") {
        log.push(`${name}: skipped — looks inactive (${verification.message}).`);
        return;
    }
    if (!verification.ok) {
        log.push(`${name}: activity check inconclusive, proceeding anyway — ${verification.message}`);
    }

    // Each step reads the lead fresh, because the previous one wrote to it.
    const afterVerification = await getLead(db, id);
    if (!afterVerification) return;

    const analysis = await analyzeLead(db, afterVerification);
    if (!analysis.ok) {
        log.push(`${name}: ${analysis.message}`);
        return;
    }

    const afterAnalysis = await getLead(db, id);
    if (!afterAnalysis) return;

    await enrichLead(db, afterAnalysis);

    const enriched = (await getLead(db, id))!;
    await findCompetitorsForLead(db, enriched);

    const withCompetitors = (await getLead(db, id))!;
    const audit = await generateAudit(db, withCompetitors);
    if (!audit.ok) log.push(`${name}: ${audit.message}`);

    const withAudit = (await getLead(db, id))!;
    const demo = await generateDemo(db, withAudit);
    if (!demo.ok) log.push(`${name}: ${demo.message}`);

    const withDemo = (await getLead(db, id))!;
    const outreach = await generateOutreach(db, withDemo);
    if (!outreach.ok) {
        log.push(`${name}: ${outreach.message}`);
        return;
    }

    await autoSend(db, id, log);
}

export async function GET(request: Request) {
    const startedAt = Date.now();

    try {
        if (!authorize(request)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const db = await getDb();
        const log: string[] = [];

        await runDiscovery(db, log);

        if (!process.env.AI_API_KEY) {
            log.push("Skipped pipeline: AI API key not configured.");
            return NextResponse.json({
                success: true,
                ranAt: new Date().toISOString(),
                log,
            });
        }

        const newLeads = await db
            .collection("leads")
            .find({ status: "New" })
            .sort({ createdAt: 1 })
            .limit(BATCH_SIZE)
            .toArray();

        let processed = 0;

        for (const lead of newLeads) {
            if (Date.now() - startedAt > TIME_BUDGET_MS) {
                log.push(
                    `Stopped early with ${newLeads.length - processed} lead(s) left in the batch — they stay "New" and are picked up on the next run.`
                );
                break;
            }

            try {
                await runLead(db, lead, log);
            } catch (error) {
                log.push(`${lead.companyName}: pipeline error — ${String(error)}`);
            }
            processed++;
        }

        return NextResponse.json({
            success: true,
            ranAt: new Date().toISOString(),
            processed,
            elapsedMs: Date.now() - startedAt,
            log,
        });
    } catch (error) {
        console.error("[cron/run-engine]", error);
        return NextResponse.json(
            { error: String(error), elapsedMs: Date.now() - startedAt },
            { status: 500 }
        );
    }
}
