import { getDb } from "@/lib/db";

/**
 * Reads the current password version for session revocation.
 *
 * `proxy.ts` runs on every dashboard and API request, so this is cached in
 * module scope with a short TTL: a password change revokes outstanding
 * sessions within `CACHE_TTL_MS` rather than instantly, in exchange for not
 * querying Mongo on every single request.
 */

const CACHE_TTL_MS = 30_000;

let cachedVersion: number | null = null;
let cachedAt = 0;

export async function getCachedPasswordVersion(): Promise<number | null> {
    if (cachedVersion !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
        return cachedVersion;
    }

    try {
        const db = await getDb();
        const record = await db
            .collection("auth")
            .findOne({ _id: "operator" as never });

        // No record yet means nobody has logged in since the credential moved
        // into the database — there is nothing to revoke.
        cachedVersion = (record?.passwordVersion as number) ?? null;
        cachedAt = Date.now();
        return cachedVersion;
    } catch (error) {
        // A database blip must not lock the operator out of their own app. The
        // signature and expiry checks still stand on their own.
        console.warn("[auth] could not read password version:", String(error));
        return null;
    }
}
