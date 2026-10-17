import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error("Missing MONGODB_URI in .env.local");
}

export const DB_NAME = "rmast";

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
    var _mongoClientPromise: Promise<MongoClient> | undefined;
    var _mongoIndexPromise: Promise<void> | undefined;
}

if (process.env.NODE_ENV === "development") {
    // In development, use a global variable so the connection isn't
    // recreated on every hot reload.
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    // In production, create a new client for each instance.
    client = new MongoClient(uri);
    clientPromise = client.connect();
}

// Every query this app runs is covered by one of these. Without them Mongo
// does a full collection scan for each leadId/channel/status lookup, which is
// invisible at 200 leads and painful at 20,000.
const INDEXES: {
    collection: string;
    keys: Record<string, 1 | -1>;
    options?: {
        name?: string;
        unique?: boolean;
        sparse?: boolean;
        expireAfterSeconds?: number;
    };
}[] = [
        { collection: "leads", keys: { status: 1, createdAt: -1 } },
        { collection: "leads", keys: { createdAt: -1 } },
        { collection: "leads", keys: { auditSlug: 1 }, options: { sparse: true } },
        { collection: "leads", keys: { campaignId: 1 }, options: { sparse: true } },
        { collection: "leads", keys: { dedupeKey: 1 }, options: { sparse: true } },
        { collection: "leads", keys: { email: 1 }, options: { sparse: true } },
        { collection: "messages", keys: { leadId: 1, sentAt: 1 } },
        { collection: "messages", keys: { channel: 1, sentAt: -1 } },
        { collection: "messages", keys: { direction: 1, sentAt: -1 } },
        { collection: "messages", keys: { providerMessageId: 1 }, options: { sparse: true } },
        { collection: "activities", keys: { leadId: 1, createdAt: -1 } },
        { collection: "activities", keys: { createdAt: -1 } },
        { collection: "callNotes", keys: { leadId: 1, createdAt: -1 } },
        { collection: "notes", keys: { leadId: 1, createdAt: -1 } },
        { collection: "appointments", keys: { scheduledAt: 1 } },
        { collection: "appointments", keys: { leadId: 1 } },
        { collection: "campaigns", keys: { status: 1 } },
        { collection: "customFeatures", keys: { slug: 1 } },
        { collection: "goals", keys: { month: 1 } },
        { collection: "suppressions", keys: { email: 1 }, options: { sparse: true } },
        // Rate-limit buckets reap themselves rather than accumulating one row
        // per client IP forever.
        {
            collection: "rateLimits",
            keys: { expiresAt: 1 },
            options: { expireAfterSeconds: 0 },
        },
    ];

async function ensureIndexes(db: Db): Promise<void> {
    for (const spec of INDEXES) {
        try {
            await db.collection(spec.collection).createIndex(spec.keys, spec.options);
        } catch (error) {
            // An index that can't be built (e.g. a conflicting definition left
            // over from an earlier deploy) must never take the app down with
            // it — every query still works, just slower.
            console.warn(
                `[db] could not create index on ${spec.collection}:`,
                String(error)
            );
        }
    }
}

/**
 * The single entry point for database access. Returns the `rmast` database and
 * guarantees indexes have been created once per process.
 */
export async function getDb(): Promise<Db> {
    const connected = await clientPromise;
    const db = connected.db(DB_NAME);

    if (!global._mongoIndexPromise) {
        global._mongoIndexPromise = ensureIndexes(db).catch((error) => {
            console.warn("[db] index setup failed:", String(error));
        });
    }
    await global._mongoIndexPromise;

    return db;
}

export default clientPromise;
