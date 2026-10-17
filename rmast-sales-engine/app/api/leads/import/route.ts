import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
    MAX_IMPORT_FILE_BYTES,
    insertImportedLeads,
    normalizeRows,
    parseCsv,
    parseExcel,
    parsePdf,
} from "@/lib/import-leads";

// PDF extraction can mean several sequential Gemini calls (one per text
// chunk), so this gets more headroom than a typical route.
export const maxDuration = 120;

type FileKind = "csv" | "excel" | "pdf";

function detectKind(filename: string, mimeType: string): FileKind | null {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".csv") || mimeType === "text/csv") return "csv";
    if (
        lower.endsWith(".xlsx") ||
        lower.endsWith(".xls") ||
        mimeType.includes("spreadsheet") ||
        mimeType.includes("excel")
    ) {
        return "excel";
    }
    if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
    return null;
}

/**
 * Imports leads from a file the operator already has — CSV, Excel, or PDF.
 * The second on-ramp for leads alongside /api/leads/discover: once a row is
 * inserted here it's a plain "New" lead, indistinguishable to the rest of the
 * pipeline (and to the scheduled run) from one Google Places found on its own.
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
        }

        if (file.size === 0) {
            return NextResponse.json({ error: "The file is empty" }, { status: 400 });
        }

        if (file.size > MAX_IMPORT_FILE_BYTES) {
            return NextResponse.json(
                {
                    error: `File is too large — the limit is ${Math.floor(
                        MAX_IMPORT_FILE_BYTES / (1024 * 1024)
                    )}MB.`,
                },
                { status: 400 }
            );
        }

        const kind = detectKind(file.name, file.type);
        if (!kind) {
            return NextResponse.json(
                { error: "Unsupported file type. Upload a .csv, .xlsx, .xls, or .pdf file." },
                { status: 400 }
            );
        }

        if (kind === "pdf" && !process.env.AI_API_KEY) {
            return NextResponse.json(
                {
                    error:
                        "Reading leads out of a PDF requires AI_API_KEY. Add it to .env.local, or export the list as CSV/Excel instead.",
                },
                { status: 501 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const defaults = {
            niche: String(formData.get("niche") || "").trim(),
            market: String(formData.get("market") || "").trim(),
            location: String(formData.get("location") || "").trim(),
        };

        let rows: Record<string, string>[];
        try {
            if (kind === "csv") {
                rows = parseCsv(buffer.toString("utf-8"));
            } else if (kind === "excel") {
                rows = parseExcel(buffer);
            } else {
                rows = await parsePdf(buffer);
            }
        } catch (error) {
            console.error("[leads/import] parse failed", error);
            return NextResponse.json(
                { error: `Could not read that file: ${String(error)}` },
                { status: 400 }
            );
        }

        if (rows.length === 0) {
            return NextResponse.json(
                {
                    error:
                        kind === "pdf"
                            ? "No businesses could be identified in that PDF."
                            : "No rows could be read from that file.",
                },
                { status: 400 }
            );
        }

        const { valid, invalidSamples, skippedInvalid } = normalizeRows(rows, defaults);

        const db = await getDb();
        const { inserted, skippedDuplicates } = await insertImportedLeads(db, valid);

        return NextResponse.json({
            success: true,
            examined: rows.length,
            inserted,
            skippedDuplicates,
            skippedInvalid,
            invalidSamples,
        });
    } catch (error) {
        console.error("[leads/import]", error);
        return NextResponse.json({ error: "Import failed" }, { status: 500 });
    }
}
