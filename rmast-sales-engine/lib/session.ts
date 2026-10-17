/**
 * Stateless, HMAC-signed session tokens.
 *
 * The cookie used to hold `AUTH_SECRET` verbatim, which meant every session
 * shared one value that never expired and never rotated — anyone who saw the
 * cookie once held a permanent key to the whole app. A token now carries its
 * own expiry and a password version, and is signed with a key derived from
 * `AUTH_SECRET` rather than being the secret itself.
 *
 * Uses Web Crypto only, so the same code runs in a route handler and in
 * `proxy.ts`.
 */

export const SESSION_COOKIE = "rmast_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export interface SessionPayload {
    /** Operator email. */
    sub: string;
    /** Password version — bumped on password change to revoke old sessions. */
    v: number;
    /** Issued at, epoch seconds. */
    iat: number;
    /** Expires at, epoch seconds. */
    exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function signingKey(): Promise<CryptoKey> {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("Missing AUTH_SECRET");

    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(`rmast-session-v1:${secret}`),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

/** Constant-time comparison — a fast `!==` leaks signature bytes by timing. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function createSessionToken(
    email: string,
    passwordVersion: number
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
        sub: email,
        v: passwordVersion,
        iat: now,
        exp: now + SESSION_MAX_AGE_SECONDS,
    };

    const body = base64UrlEncode(
        new TextEncoder().encode(JSON.stringify(payload))
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        await signingKey(),
        new TextEncoder().encode(body)
    );

    return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the payload for a token with a valid signature that has not expired,
 * or `null`. Does not check the password version — that needs the database, so
 * it happens in `proxy.ts`.
 */
export async function verifySessionToken(
    token: string | undefined | null
): Promise<SessionPayload | null> {
    if (!token) return null;

    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    let expected: string;
    try {
        const bytes = await crypto.subtle.sign(
            "HMAC",
            await signingKey(),
            new TextEncoder().encode(body)
        );
        expected = base64UrlEncode(new Uint8Array(bytes));
    } catch {
        return null;
    }

    if (!timingSafeEqual(signature, expected)) return null;

    let payload: SessionPayload;
    try {
        payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    } catch {
        return null;
    }

    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
        return null;
    }

    return payload;
}
