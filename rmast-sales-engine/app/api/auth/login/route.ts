import { NextResponse } from "next/server";
import {
    getPasswordVersion,
    isValidOperatorEmail,
    verifyOperatorPassword,
} from "@/lib/auth";
import { checkRateLimit, clientIp, resetRateLimit } from "@/lib/rate-limit";
import {
    SESSION_COOKIE,
    createSessionToken,
} from "@/lib/session";

const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCKOUT_SECONDS = 15 * 60;

export async function POST(request: Request) {
    try {
        const ip = clientIp(request);

        const limit = await checkRateLimit({
            scope: "login",
            key: ip,
            limit: LOGIN_LIMIT,
            windowSeconds: LOGIN_WINDOW_SECONDS,
            lockoutSeconds: LOGIN_LOCKOUT_SECONDS,
        });

        if (!limit.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Too many failed attempts. Try again in ${Math.ceil(
                        limit.retryAfterSeconds / 60
                    )} minutes.`,
                },
                {
                    status: 429,
                    headers: { "Retry-After": String(limit.retryAfterSeconds) },
                }
            );
        }

        const { email, password } = await request.json();

        const emailOk = isValidOperatorEmail(String(email || ""));
        const passwordOk = await verifyOperatorPassword(String(password || ""));

        if (!emailOk || !passwordOk) {
            return NextResponse.json(
                { success: false, error: "Invalid email or password" },
                { status: 401 }
            );
        }

        await resetRateLimit("login", ip);

        const token = await createSessionToken(
            String(email).trim().toLowerCase(),
            await getPasswordVersion()
        );

        const response = NextResponse.json({ success: true });
        response.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            // No maxAge: a browser-session cookie, gone when the browser
            // closes, so the company's data always asks for a fresh sign-in.
            // The token inside still expires after SESSION_MAX_AGE_SECONDS.
        });
        return response;
    } catch (error) {
        console.error("[auth/login]", error);
        return NextResponse.json(
            { success: false, error: "Login failed" },
            { status: 500 }
        );
    }
}
