/**
 * The app's public base URL, for every link a prospect will click: audit and
 * demo links in outreach, and unsubscribe links in emails.
 *
 * NEXT_PUBLIC_APP_URL is the setting, but it is easy to deploy with the local
 * value (http://localhost:3000) copied over from .env.local, and then every
 * link a prospect gets is dead. On Vercel, a localhost or missing value falls
 * back to the project's production domain, which Vercel provides itself.
 */
export function publicAppUrl(): string {
    const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
    const isLocal = !configured || /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(configured);

    if (isLocal && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
    }
    return configured;
}

/** Replaces any localhost base URL in a message with the public one, so a
 *  draft written before deployment never goes out with dead links. */
export function withPublicLinks(text: string): string {
    const base = publicAppUrl();
    if (!base || /localhost|127\.0\.0\.1/.test(base)) return text;
    return text.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi, base);
}
