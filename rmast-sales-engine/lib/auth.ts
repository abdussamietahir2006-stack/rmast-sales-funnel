import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import type { Db } from "mongodb";
import { getDb } from "@/lib/db";

/**
 * Operator credentials.
 *
 * The password used to live only in `.env.local`, which the change-password
 * route rewrote with `fs.writeFileSync` — that 500s on Vercel, where the
 * filesystem is read-only. The password hash now lives in Mongo, seeded from
 * `AUTH_PASSWORD` on first use, so changing it works in production and bumps a
 * version that invalidates every existing session.
 */

const AUTH_DOC_ID = "operator";
const AUTH_COLLECTION = "auth";
const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export interface AuthRecord {
    _id: string;
    passwordHash: string;
    passwordSalt: string;
    /** Incremented on every password change; embedded in session tokens. */
    passwordVersion: number;
    updatedAt: string;
}

function hashPassword(password: string, salt: string): string {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
}

async function readAuthRecord(db: Db): Promise<AuthRecord | null> {
    return (await db
        .collection(AUTH_COLLECTION)
        .findOne({ _id: AUTH_DOC_ID as never })) as AuthRecord | null;
}

async function writeAuthRecord(
    db: Db,
    password: string,
    passwordVersion: number
): Promise<AuthRecord> {
    const passwordSalt = randomBytes(16).toString("hex");
    const record: AuthRecord = {
        _id: AUTH_DOC_ID,
        passwordHash: hashPassword(password, passwordSalt),
        passwordSalt,
        passwordVersion,
        updatedAt: new Date().toISOString(),
    };

    await db
        .collection(AUTH_COLLECTION)
        .updateOne(
            { _id: AUTH_DOC_ID as never },
            { $set: record },
            { upsert: true }
        );

    return record;
}

/**
 * Seeds the stored credential from `AUTH_PASSWORD` the first time it's needed,
 * so an existing deployment keeps working without a migration step.
 */
async function getOrSeedAuthRecord(db: Db): Promise<AuthRecord | null> {
    const existing = await readAuthRecord(db);
    if (existing) return existing;

    const seed = process.env.AUTH_PASSWORD;
    if (!seed) return null;

    return writeAuthRecord(db, seed, 1);
}

export async function verifyOperatorPassword(password: string): Promise<boolean> {
    if (!password) return false;

    const db = await getDb();
    const record = await getOrSeedAuthRecord(db);
    if (!record) return false;

    return constantTimeEquals(
        hashPassword(password, record.passwordSalt),
        record.passwordHash
    );
}

export async function getPasswordVersion(): Promise<number> {
    const db = await getDb();
    const record = await getOrSeedAuthRecord(db);
    return record?.passwordVersion ?? 1;
}

/** Sets a new password and revokes every session issued under the old one. */
export async function setOperatorPassword(newPassword: string): Promise<number> {
    const db = await getDb();
    const current = await getOrSeedAuthRecord(db);
    const nextVersion = (current?.passwordVersion ?? 1) + 1;
    const record = await writeAuthRecord(db, newPassword, nextVersion);
    return record.passwordVersion;
}

export function isValidOperatorEmail(email: string): boolean {
    const expected = process.env.AUTH_EMAIL;
    if (!expected || !email) return false;
    return constantTimeEquals(email.trim().toLowerCase(), expected.trim().toLowerCase());
}
