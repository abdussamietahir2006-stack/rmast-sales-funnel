import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { COLLECTION_MAP, buildFeatureQuery } from "@/lib/custom-features";

const RESULT_LIMIT = 200;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const db = await getDb();
        const feature = await db.collection("customFeatures").findOne({ slug });

        if (!feature) {
            return NextResponse.json({ error: "Feature not found" }, { status: 404 });
        }

        const query = buildFeatureQuery(feature);
        if (!query) {
            return NextResponse.json(
                { error: "This feature points at an unknown data source." },
                { status: 400 }
            );
        }

        const collectionName = COLLECTION_MAP[feature.dataSource as string];

        const results = await db
            .collection(collectionName)
            .find(query, {
                // Never ship generated demo pages through a saved view.
                projection: collectionName === "leads" ? { demoHtml: 0 } : {},
            })
            .sort({ createdAt: -1 })
            .limit(RESULT_LIMIT)
            .toArray();

        return NextResponse.json({ feature, results });
    } catch (error) {
        console.error("[custom-features/:slug GET]", error);
        return NextResponse.json({ error: "Could not load feature" }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const db = await getDb();
        const result = await db.collection("customFeatures").deleteOne({ slug });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: "Feature not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[custom-features/:slug DELETE]", error);
        return NextResponse.json(
            { error: "Could not delete feature" },
            { status: 500 }
        );
    }
}
