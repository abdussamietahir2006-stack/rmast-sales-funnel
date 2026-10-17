import { getDb } from "@/lib/db";

/**
 * Database-backed rate limiting.
 *
 * In-memory counters are useless on Vercel: each serverless instance gets its
 * own copy, so an attacker just keeps hitting until they land on a fresh one.
 * Login attempts are rare enough that a Mongo round trip per attempt costs
 * nothing.
 */

export interface RateLimitResult {
    allowed: boolean;
    /** Seconds until the caller may try again, when blocked. */
    retryAfterSeconds: number;
    remaining: number;
}

export interface RateLimitOptions {
    /** Logical bucket, e.g. "login". */
    scope: string;
    /** Caller identity — normally the client IP. */
    key: string;
    limit: number;
    windowSeconds: number;
    /** How long to lock out once the limit is exceeded. */
    lockoutSeconds: number;
}

interface AttemptRecord {
    _id: string;
    count: number;
    windowStartedAt: number;
    lockedUntil?: number;
    /** Drives the TTL index, so buckets don't accumulate one per client IP. */
    expiresAt: Date;
}

/** How long past the lockout a record is kept before Mongo reaps it. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function checkRateLimit(
    options: RateLimitOptions
): Promise<RateLimitResult> {
    const { scope, key, limit, windowSeconds, lockoutSeconds } = options;
    const now = Date.now();
    const id = `${scope}:${key}`;

    let collection;
    try {
        collection = (await getDb()).collection<AttemptRecord>("rateLimits");
    } catch {
        // If the limiter itself is broken, don't take login down with it.
        return { allowed: true, retryAfterSeconds: 0, remaining: limit };
    }

    const existing = await collection.findOne({ _id: id });

    if (existing?.lockedUntil && existing.lockedUntil > now) {
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil((existing.lockedUntil - now) / 1000),
            remaining: 0,
        };
    }

    const windowExpired =
        !existing || now - existing.windowStartedAt > windowSeconds * 1000;

    if (windowExpired) {
        await collection.updateOne(
            { _id: id },
            {
                $set: {
                    count: 1,
                    windowStartedAt: now,
                    expiresAt: new Date(now + RETENTION_MS),
                },
                $unset: { lockedUntil: "" },
            },
            { upsert: true }
        );
        return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1 };
    }

    const nextCount = existing.count + 1;

    if (nextCount > limit) {
        const lockedUntil = now + lockoutSeconds * 1000;
        await collection.updateOne(
            { _id: id },
            {
                $set: {
                    count: nextCount,
                    lockedUntil,
                    expiresAt: new Date(lockedUntil + RETENTION_MS),
                },
            }
        );
        return {
            allowed: false,
            retryAfterSeconds: lockoutSeconds,
            remaining: 0,
        };
    }

    await collection.updateOne({ _id: id }, { $set: { count: nextCount } });
    return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: limit - nextCount,
    };
}

/** Clears a bucket — call after a successful login. */
export async function resetRateLimit(scope: string, key: string): Promise<void> {
    try {
        const db = await getDb();
        await db.collection("rateLimits").deleteOne({ _id: `${scope}:${key}` as never });
    } catch {
        // Non-fatal: the window expires on its own.
    }
}

/** Best-effort client IP, trusting the platform's proxy headers. */
export function clientIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return request.headers.get("x-real-ip") || "unknown";
}
