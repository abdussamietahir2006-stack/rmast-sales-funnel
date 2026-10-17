import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { getCachedPasswordVersion } from "@/lib/token-version";

/**
 * The matcher used to cover only `/dashboard/:path*`, which left every
 * `/api/*` route open to anyone with the URL — including the full lead export,
 * lead deletion, and the AI endpoints that spend Gemini quota. It now covers
 * the API too, and everything is operator-only unless it appears below.
 */

/** Exact public API paths. */
const PUBLIC_API_PATHS = new Set([
    "/api/auth/login",
    "/api/auth/logout",
    "/api/health",
]);

/**
 * Public API prefixes. These are the prospect-facing surfaces: the audit
 * report a lead is emailed, the demo page it links to, the booking form on it,
 * and the unsubscribe link. `/api/cron`, `/api/engine` and `/api/webhooks` authenticate
 * themselves with a shared secret or provider signature instead of a cookie.
 */
const PUBLIC_API_PREFIXES = [
    "/api/audit/",
    "/api/demo/",
    "/api/public/",
    "/api/cron/",
    "/api/engine/",
    "/api/webhooks/",
];

function isPublicApiPath(pathname: string): boolean {
    if (PUBLIC_API_PATHS.has(pathname)) return true;
    return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isApi = pathname.startsWith("/api/");

    if (isApi && isPublicApiPath(pathname)) {
        return NextResponse.next();
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = await verifySessionToken(token);

    let authorized = session !== null;

    if (session) {
        // A password change bumps this version, which revokes every session
        // issued before it. Null means "unknown" (no record yet, or the
        // database is unreachable) — the signature and expiry still gate it.
        const currentVersion = await getCachedPasswordVersion();
        if (currentVersion !== null && session.v !== currentVersion) {
            authorized = false;
        }
    }

    if (authorized) {
        return NextResponse.next();
    }

    if (isApi) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    // Clear an expired or revoked cookie so the browser stops sending it.
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
}

export const config = {
    matcher: ["/dashboard/:path*", "/api/:path*"],
};
