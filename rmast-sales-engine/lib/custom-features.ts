/**
 * Custom feature pages let the operator define a saved view over one
 * collection. The filter used to be applied as `query[feature.filterField] =
 * feature.filterValue` — an attacker-controlled key written straight into a
 * Mongo query, reachable through what was then an unauthenticated POST. That
 * allows operators like `$where`, `$expr` and `$regex`, so both the field and
 * the data source are now checked against fixed allowlists.
 */

export const COLLECTION_MAP: Record<string, string> = {
    leads: "leads",
    messages: "messages",
    appointments: "appointments",
    activities: "activities",
};

/** Fields a saved view is allowed to filter on, per data source. */
export const FILTERABLE_FIELDS: Record<string, string[]> = {
    leads: [
        "status",
        "niche",
        "market",
        "location",
        "contactMethod",
        "contactSource",
        "campaignId",
    ],
    messages: ["channel", "direction", "sentiment"],
    appointments: ["status", "serviceInterest", "budget", "timeline", "source"],
    activities: ["type"],
};

/** Matches the options offered on the Custom Features page. */
export const VIEW_TYPES = ["table", "stat"];

export function isValidDataSource(dataSource: unknown): dataSource is string {
    return (
        typeof dataSource === "string" &&
        Object.prototype.hasOwnProperty.call(COLLECTION_MAP, dataSource)
    );
}

export function isValidFilterField(dataSource: string, field: unknown): boolean {
    if (typeof field !== "string" || field === "") return false;
    return (FILTERABLE_FIELDS[dataSource] || []).includes(field);
}

/**
 * Builds a safe Mongo filter from a stored feature definition. Anything that
 * doesn't pass validation is dropped rather than trusted.
 */
export function buildFeatureQuery(
    feature: Record<string, unknown>
): Record<string, string> | null {
    if (!isValidDataSource(feature.dataSource)) return null;

    const query: Record<string, string> = {};

    if (
        isValidFilterField(feature.dataSource, feature.filterField) &&
        typeof feature.filterValue === "string" &&
        feature.filterValue !== ""
    ) {
        query[feature.filterField as string] = feature.filterValue;
    }

    return query;
}
