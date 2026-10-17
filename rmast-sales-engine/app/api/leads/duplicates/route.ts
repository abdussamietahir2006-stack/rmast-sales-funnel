import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Duplicate leads, grouped by normalized company name + market.
 *
 * The grouping runs in Mongo rather than by loading every lead into memory,
 * and only groups with more than one member come back — the old version pulled
 * the whole collection (including generated demo pages) to throw almost all of
 * it away.
 */
export async function GET() {
    try {
        const db = await getDb();

        const duplicateGroups = await db
            .collection("leads")
            .aggregate([
                {
                    $addFields: {
                        groupKey: {
                            $concat: [
                                {
                                    // Strip everything but letters and digits,
                                    // so "Joe's Diner" and "Joe Diner" collide.
                                    // Computed here rather than read from
                                    // `dedupeKey` so leads created before that
                                    // field existed are still compared.
                                    $reduce: {
                                        input: {
                                            $regexFindAll: {
                                                input: { $toLower: { $ifNull: ["$companyName", ""] } },
                                                regex: "[a-z0-9]+",
                                            },
                                        },
                                        initialValue: "",
                                        in: { $concat: ["$$value", "$$this.match"] },
                                    },
                                },
                                "|",
                                { $toLower: { $ifNull: ["$market", ""] } },
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: "$groupKey",
                        leads: {
                            $push: {
                                _id: "$_id",
                                companyName: "$companyName",
                                niche: "$niche",
                                market: "$market",
                                location: "$location",
                                website: "$website",
                                email: "$email",
                                phone: "$phone",
                                status: "$status",
                                createdAt: "$createdAt",
                            },
                        },
                        count: { $sum: 1 },
                    },
                },
                { $match: { count: { $gt: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 200 },
            ])
            .toArray();

        return NextResponse.json({
            duplicateGroups: duplicateGroups.map((group) => group.leads),
        });
    } catch (error) {
        console.error("[leads/duplicates]", error);
        return NextResponse.json(
            { error: "Could not load duplicates" },
            { status: 500 }
        );
    }
}
