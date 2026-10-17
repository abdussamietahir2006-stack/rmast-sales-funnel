import { Db } from "mongodb";
import * as XLSX from "xlsx";
import { extractText } from "unpdf";
import { callGeminiJson } from "@/lib/ai";
import { dedupeKey } from "@/lib/places";

/**
 * Importing leads from a file the operator already sourced by hand — a CSV or
 * Excel export from wherever they were searching, or a PDF list someone sent
 * them. This is the second on-ramp for leads alongside Google Places
 * discovery (lib/places.ts): once a row lands in `leads`, the pipeline picks
 * it up exactly the same way regardless of where it came from.
 */

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
/** Past this many data rows, the rest of a spreadsheet is ignored rather than
 *  risking an oversized insertMany or an accidental full-database paste. */
const MAX_ROWS = 2000;

export interface ImportDefaults {
    niche?: string;
    market?: string;
    location?: string;
}

export interface ImportedLead {
    companyName: string;
    niche: string;
    market: string;
    location: string;
    website: string;
    phone: string;
    email: string;
}

export interface InvalidRow {
    row: number;
    reason: string;
}

export interface ImportOutcome {
    inserted: number;
    skippedDuplicates: number;
    skippedInvalid: number;
    invalidSamples: InvalidRow[];
    examined: number;
}

// --- Column mapping ---------------------------------------------------------

const FIELD_ALIASES: Record<keyof ImportedLead, string[]> = {
    companyName: [
        "companyname",
        "company",
        "business",
        "businessname",
        "name",
        "leadname",
        "organization",
        "org",
        "clientname",
    ],
    niche: ["niche", "industry", "category", "businesstype", "sector", "vertical"],
    market: ["market", "country"],
    location: ["location", "address", "city", "state", "region", "citystate"],
    website: ["website", "url", "site", "web", "domain", "webaddress"],
    phone: ["phone", "phonenumber", "tel", "telephone", "mobile", "cell", "contactnumber"],
    email: ["email", "emailaddress", "emailid"],
};

function normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Maps each raw column header to one of our fixed fields, first match wins. */
function buildHeaderMap(headers: string[]): Map<string, keyof ImportedLead> {
    const map = new Map<string, keyof ImportedLead>();
    for (const header of headers) {
        const normalized = normalizeHeader(header);
        if (map.has(normalized)) continue;
        for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
            keyof ImportedLead,
            string[],
        ][]) {
            if (aliases.includes(normalized)) {
                map.set(normalized, field);
                break;
            }
        }
    }
    return map;
}

function mapRow(
    headerMap: Map<string, keyof ImportedLead>,
    raw: Record<string, unknown>
): Partial<ImportedLead> {
    const out: Partial<ImportedLead> = {};
    for (const [rawHeader, value] of Object.entries(raw)) {
        const field = headerMap.get(normalizeHeader(rawHeader));
        if (!field || out[field]) continue; // first non-empty column for a field wins
        const text = String(value ?? "").trim();
        if (text) out[field] = text;
    }
    return out;
}

// --- CSV ---------------------------------------------------------------------

/** A small quoted-field-aware CSV tokenizer — handles commas and escaped
 *  quotes inside quoted fields, and both CRLF and LF line endings. */
function tokenizeCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\r") {
            // ignored — the paired \n (or end of input) closes the row
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseCsv(text: string): Record<string, string>[] {
    const rows = tokenizeCsv(text);
    if (rows.length === 0) return [];

    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((cells) => {
        const record: Record<string, string> = {};
        headers.forEach((header, i) => {
            record[header] = cells[i] ?? "";
        });
        return record;
    });
}

// --- Excel ---------------------------------------------------------------

export function parseExcel(buffer: Buffer): Record<string, string>[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    return XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName], {
        defval: "",
        raw: false,
    });
}

// --- PDF -------------------------------------------------------------------
//
// A PDF has no columns to map, so structure has to come from the model: the
// extracted text is split into chunks and each is turned into a JSON list of
// businesses. Every chunk goes through the same shared concurrency/backoff
// gate as the rest of the pipeline (lib/ai.ts), so this doesn't need its own
// throttling — it just costs one Gemini call per chunk.

const PDF_CHUNK_CHARS = 8000;
const PDF_MAX_CHUNKS = 8;

interface PdfLeadCandidate {
    companyName?: string;
    niche?: string;
    market?: string;
    location?: string;
    website?: string;
    phone?: string;
    email?: string;
}

export async function parsePdf(buffer: Buffer): Promise<Record<string, string>[]> {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    const trimmed = text.trim();
    if (!trimmed) return [];

    const chunks: string[] = [];
    for (let i = 0; i < trimmed.length && chunks.length < PDF_MAX_CHUNKS; i += PDF_CHUNK_CHARS) {
        chunks.push(trimmed.slice(i, i + PDF_CHUNK_CHARS));
    }

    const rows: Record<string, string>[] = [];

    for (const chunk of chunks) {
        try {
            const result = await callGeminiJson<{ leads: PdfLeadCandidate[] }>(
                `
The following text was extracted from a PDF that is expected to contain a
list of businesses (a lead list, directory export, or similar document).

Extract every distinct business mentioned. For each one, include only the
fields actually present in the text — never invent a value that isn't there.

"""
${chunk}
"""

Return JSON exactly:
{ "leads": [{ "companyName": "required", "niche": "optional", "market": "optional", "location": "optional", "website": "optional", "phone": "optional", "email": "optional" }] }

If this text contains no identifiable businesses, return { "leads": [] }.
`.trim()
            );

            for (const lead of result.leads || []) {
                if (!lead.companyName) continue;
                rows.push({
                    companyName: lead.companyName,
                    niche: lead.niche || "",
                    market: lead.market || "",
                    location: lead.location || "",
                    website: lead.website || "",
                    phone: lead.phone || "",
                    email: lead.email || "",
                });
            }
        } catch (error) {
            // One unreadable chunk shouldn't discard everything extracted
            // from the rest of the document.
            console.warn("[import] PDF chunk extraction failed:", String(error));
        }
    }

    return rows;
}

// --- Normalization + insert --------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRows(
    rows: Record<string, unknown>[],
    defaults: ImportDefaults
): {
    valid: ImportedLead[];
    invalidSamples: InvalidRow[];
    skippedInvalid: number;
} {
    if (rows.length === 0) return { valid: [], invalidSamples: [], skippedInvalid: 0 };

    const headerMap = buildHeaderMap(Object.keys(rows[0]));
    const valid: ImportedLead[] = [];
    const invalidSamples: InvalidRow[] = [];
    let skippedInvalid = 0;

    rows.slice(0, MAX_ROWS).forEach((raw, index) => {
        const mapped = mapRow(headerMap, raw);
        const companyName = mapped.companyName;

        if (!companyName) {
            skippedInvalid++;
            if (invalidSamples.length < 10) {
                invalidSamples.push({
                    row: index + 1,
                    reason: "No company/business name could be found in this row",
                });
            }
            return;
        }

        // A malformed email costs only itself, not the whole lead — enrichment
        // can find a real one later.
        const email = mapped.email && EMAIL_RE.test(mapped.email) ? mapped.email : "";

        const market = mapped.market || defaults.market || "";

        valid.push({
            companyName,
            niche: mapped.niche || defaults.niche || "",
            market,
            location: mapped.location || defaults.location || market || "",
            website: mapped.website || "",
            phone: mapped.phone || "",
            email,
        });
    });

    return { valid, invalidSamples, skippedInvalid };
}

export async function insertImportedLeads(
    db: Db,
    leads: ImportedLead[],
    options: { contactSource?: string; campaignId?: string } = {}
): Promise<{ inserted: number; skippedDuplicates: number }> {
    if (leads.length === 0) return { inserted: 0, skippedDuplicates: 0 };

    const now = new Date().toISOString();
    const seen = new Set<string>();
    const candidates: (ImportedLead & { dedupeKey: string })[] = [];

    for (const lead of leads) {
        // Falls back to location when market is blank — an import with no
        // market column shouldn't collapse every same-named business in
        // different cities into one duplicate.
        const key = dedupeKey(lead.companyName, lead.market || lead.location);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ ...lead, dedupeKey: key });
    }

    const existing = await db
        .collection("leads")
        .find(
            { dedupeKey: { $in: candidates.map((c) => c.dedupeKey) } },
            { projection: { dedupeKey: 1 } }
        )
        .toArray();
    const existingKeys = new Set(existing.map((doc) => doc.dedupeKey as string));

    const toInsert = candidates
        .filter((c) => !existingKeys.has(c.dedupeKey))
        .map((c) => ({
            companyName: c.companyName,
            niche: c.niche,
            market: c.market,
            location: c.location,
            website: c.website,
            phone: c.phone,
            email: c.email,
            contactSource: options.contactSource || "manual_import",
            // Unlike contactSource, which enrichment can update later, this
            // records where the lead came from and never changes.
            discoveredBy: options.contactSource || "manual_import",
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            dedupeKey: c.dedupeKey,
            status: "New",
            createdAt: now,
        }));

    if (toInsert.length > 0) {
        await db.collection("leads").insertMany(toInsert as never[]);
    }

    return {
        inserted: toInsert.length,
        skippedDuplicates: leads.length - toInsert.length,
    };
}
