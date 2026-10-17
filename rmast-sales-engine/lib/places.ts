import { Db } from "mongodb";

/**
 * Lead discovery via the Google Places API (Text Search).
 *
 * This was a stub that always returned `count: 0`, so the front of the funnel
 * produced nothing. Results are filtered to operational businesses and
 * deduplicated on a normalized name + market key before insert.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
/** The API caps a page at 20 and offers at most three pages per query. */
const PAGE_SIZE = 20;
const MAX_PAGES = 3;

const FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.websiteUri",
    "places.internationalPhoneNumber",
    "places.businessStatus",
    "nextPageToken",
].join(",");

interface PlaceResult {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    websiteUri?: string;
    internationalPhoneNumber?: string;
    businessStatus?: string;
}

export interface DiscoverOptions {
    campaignId?: string;
    niche: string;
    country: string;
    state: string;
    count: number;
}

export interface DiscoverResult {
    inserted: number;
    skippedDuplicates: number;
    examined: number;
    warning?: string;
}

/** Stable key for duplicate detection, matching the duplicates report. */
export function dedupeKey(companyName: string, market: string): string {
    const name = (companyName || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const scope = (market || "").toLowerCase().trim();
    return `${name}|${scope}`;
}

async function searchPage(
    query: string,
    apiKey: string,
    pageToken?: string
): Promise<{ places: PlaceResult[]; nextPageToken?: string }> {
    const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
            textQuery: query,
            pageSize: PAGE_SIZE,
            ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Google Places error ${res.status}: ${detail}`);
    }

    const data = await res.json();
    return { places: data.places || [], nextPageToken: data.nextPageToken };
}

export async function discoverLeads(
    db: Db,
    options: DiscoverOptions
): Promise<DiscoverResult> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        throw new Error("GOOGLE_PLACES_API_KEY is not configured");
    }

    const { campaignId, niche, country, state, count } = options;
    const market = country;
    const query = `${niche} in ${state}, ${country}`;

    const collected: PlaceResult[] = [];
    let pageToken: string | undefined;
    let warning: string | undefined;

    for (let page = 0; page < MAX_PAGES && collected.length < count; page++) {
        let result;
        try {
            result = await searchPage(query, apiKey, pageToken);
        } catch (error) {
            // Keep whatever earlier pages returned rather than losing the run.
            warning = String(error);
            break;
        }

        collected.push(...result.places);
        pageToken = result.nextPageToken;
        if (!pageToken) break;
    }

    const operational = collected
        .filter((place) => place.businessStatus === "OPERATIONAL")
        .filter((place) => place.displayName?.text)
        .slice(0, count);

    if (operational.length === 0) {
        return { inserted: 0, skippedDuplicates: 0, examined: collected.length, warning };
    }

    const keys = operational.map((place) =>
        dedupeKey(place.displayName!.text!, market)
    );

    const existing = await db
        .collection("leads")
        .find({ dedupeKey: { $in: keys } }, { projection: { dedupeKey: 1 } })
        .toArray();

    const seen = new Set(existing.map((doc) => doc.dedupeKey as string));
    const now = new Date().toISOString();
    const newLeads: Record<string, unknown>[] = [];

    for (const place of operational) {
        const companyName = place.displayName!.text!;
        const key = dedupeKey(companyName, market);

        // Guard against duplicates already in the database and repeats inside
        // this same result set.
        if (seen.has(key)) continue;
        seen.add(key);

        newLeads.push({
            campaignId: campaignId || undefined,
            companyName,
            niche,
            market,
            location: place.formattedAddress || state,
            website: place.websiteUri || "",
            phone: place.internationalPhoneNumber || "",
            email: "",
            businessStatus: place.businessStatus,
            placeId: place.id,
            contactSource: "google_places",
            dedupeKey: key,
            status: "New",
            createdAt: now,
        });
    }

    if (newLeads.length > 0) {
        await db.collection("leads").insertMany(newLeads as never[]);
    }

    return {
        inserted: newLeads.length,
        skippedDuplicates: operational.length - newLeads.length,
        examined: collected.length,
        warning,
    };
}
