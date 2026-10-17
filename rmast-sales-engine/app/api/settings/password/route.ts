import { NextResponse } from "next/server";
import { setOperatorPassword, verifyOperatorPassword } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

const MIN_PASSWORD_LENGTH = 12;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const currentPassword = String(body.currentPassword || "");
        const newPassword = String(body.newPassword || "");

        if (!(await verifyOperatorPassword(currentPassword))) {
            return NextResponse.json(
                { error: "Current password is incorrect" },
                { status: 401 }
            );
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return NextResponse.json(
                {
                    error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
                },
                { status: 400 }
            );
        }

        if (newPassword === currentPassword) {
            return NextResponse.json(
                { error: "New password must be different from the current one" },
                { status: 400 }
            );
        }

        // Stored as a PBKDF2 hash in MongoDB. The old implementation rewrote
        // .env.local with fs.writeFileSync, which fails on Vercel's read-only
        // filesystem and left every existing session valid afterwards.
        await setOperatorPassword(newPassword);

        const response = NextResponse.json({
            success: true,
            message:
                "Password updated. All sessions — including this one — have been signed out.",
        });

        // The version bump revokes every outstanding token; drop this one now
        // rather than waiting for the proxy's cache to expire.
        response.cookies.set(SESSION_COOKIE, "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });

        return response;
    } catch (error) {
        console.error("[settings/password]", error);
        return NextResponse.json(
            { error: "Could not update password" },
            { status: 500 }
        );
    }
}
