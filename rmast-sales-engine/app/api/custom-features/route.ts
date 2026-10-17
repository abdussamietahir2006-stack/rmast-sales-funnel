import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
    VIEW_TYPES,
    isValidDataSource,
    isValidFilterField,
} from "@/lib/custom-features";

function slugify(name: string) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

export async function GET() {
    try {
        const db = await getDb();
        const features = await db
            .collection("customFeatures")
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json({ features });
    } catch (error) {
        console.error("[custom-features GET]", error);
        return NextResponse.json(
            { error: "Could not load features" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const name = String(body.name || "").trim();
        const { dataSource, viewType } = body;

        if (!name || !dataSource || !viewType) {
            return NextResponse.json(
                { error: "name, dataSource, and viewType are required" },
                { status: 400 }
            );
        }

        // Validated on the way in as well as on read, so a bad definition never
        // reaches the database in the first place.
        if (!isValidDataSource(dataSource)) {
            return NextResponse.json({ error: "Unknown data source" }, { status: 400 });
        }

        if (!VIEW_TYPES.includes(String(viewType))) {
            return NextResponse.json({ error: "Unknown view type" }, { status: 400 });
        }

        const filterField = String(body.filterField || "");
        const filterValue = String(body.filterValue || "");

        if (filterField && !isValidFilterField(dataSource, filterField)) {
            return NextResponse.json(
                { error: `"${filterField}" is not a filterable field on ${dataSource}` },
                { status: 400 }
            );
        }

        const slug = slugify(name);
        if (!slug) {
            return NextResponse.json(
                { error: "Name must contain at least one letter or number" },
                { status: 400 }
            );
        }

        const db = await getDb();

        const existing = await db.collection("customFeatures").findOne({ slug });
        if (existing) {
            return NextResponse.json(
                { error: "A feature with this name already exists" },
                { status: 400 }
            );
        }

        const feature = {
            name,
            slug,
            description: String(body.description || ""),
            dataSource,
            viewType: String(viewType),
            filterField,
            filterValue,
            createdAt: new Date().toISOString(),
        };

        const result = await db.collection("customFeatures").insertOne(feature);

        return NextResponse.json({
            success: true,
            feature: { ...feature, _id: result.insertedId },
        });
    } catch (error) {
        console.error("[custom-features POST]", error);
        return NextResponse.json(
            { error: "Could not create feature" },
            { status: 500 }
        );
    }
}
