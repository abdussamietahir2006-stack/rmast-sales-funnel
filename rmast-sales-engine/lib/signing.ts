import { createHmac, timingSafeEqual } from "crypto";

/**
 * Opaque, tamper-proof tokens for public links (unsubscribe, one-click
 * actions). A raw lead id in a public URL is enumerable — anyone could
 * unsubscribe or act on someone else's lead by counting upward.
 */

function key(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("Missing AUTH_SECRET");
    return secret;
}

function digest(purpose: string, value: string): string {
    return createHmac("sha256", key())
        .update(`${purpose}:${value}`)
        .digest("base64url");
}

export function signValue(purpose: string, value: string): string {
    return `${Buffer.from(value).toString("base64url")}.${digest(purpose, value)}`;
}

export function verifySignedValue(
    purpose: string,
    token: string | null | undefined
): string | null {
    if (!token) return null;

    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;

    let value: string;
    try {
        value = Buffer.from(encoded, "base64url").toString("utf8");
    } catch {
        return null;
    }

    const expected = digest(purpose, value);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return value;
}
