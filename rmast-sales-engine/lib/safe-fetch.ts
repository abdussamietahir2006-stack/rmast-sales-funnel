import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * Outbound fetch for URLs that came from lead data.
 *
 * Enrichment fetches `lead.website`, and leads can be created through the API,
 * so an unvalidated fetch here is a server-side request forgery hole: a lead
 * pointing at `http://169.254.169.254/` or `http://localhost:27017` makes this
 * server read things only it can reach. Every hop is resolved and checked
 * against private address space before the request goes out.
 */

const MAX_REDIRECTS = 3;
// Generous because some site builders (Gatsby, Webflow) inline over a megabyte
// of CSS before any page content; cutting earlier left nothing to read.
const MAX_BODY_BYTES = 3 * 1024 * 1024;

export class UnsafeUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsafeUrlError";
    }
}

function ipv4IsPrivate(address: string): boolean {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p))) return true;
    const [a, b] = parts;

    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // IETF protocol assignments
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
}

function ipv6IsPrivate(address: string): boolean {
    const normalized = address.toLowerCase().split("%")[0];

    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fe80")) return true; // link-local
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
    if (normalized.startsWith("ff")) return true; // multicast

    // IPv4-mapped (::ffff:169.254.169.254) tunnels straight back to IPv4 space.
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4IsPrivate(mapped[1]);

    return false;
}

function addressIsPrivate(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return ipv4IsPrivate(address);
    if (family === 6) return ipv6IsPrivate(address);
    return true;
}

async function assertUrlIsSafe(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new UnsafeUrlError(`Blocked protocol: ${url.protocol}`);
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "");

    if (isIP(hostname)) {
        if (addressIsPrivate(hostname)) {
            throw new UnsafeUrlError(`Blocked private address: ${hostname}`);
        }
        return url;
    }

    let addresses: { address: string }[];
    try {
        addresses = await lookup(hostname, { all: true });
    } catch {
        throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
    }

    if (addresses.length === 0) {
        throw new UnsafeUrlError(`Host resolved to nothing: ${hostname}`);
    }

    // Every resolved address must be public. A host that returns one public and
    // one private address is a DNS rebinding attempt.
    for (const { address } of addresses) {
        if (addressIsPrivate(address)) {
            throw new UnsafeUrlError(
                `Host ${hostname} resolves to a private address (${address})`
            );
        }
    }

    return url;
}

/**
 * Fetches a lead-supplied URL, validating the target (and every redirect hop)
 * against private address space, and returns at most `MAX_BODY_BYTES` of text.
 */
export async function fetchExternalText(
    rawUrl: string,
    timeoutMs = 8000
): Promise<string | null> {
    const res = await fetchExternal(rawUrl, timeoutMs);
    if (!res) return null;
    const body = await res.text();
    return body.slice(0, MAX_BODY_BYTES);
}

/** Same guards as fetchExternalText, for binary content such as images. */
export async function fetchExternalBytes(
    rawUrl: string,
    timeoutMs = 8000
): Promise<Buffer | null> {
    const res = await fetchExternal(rawUrl, timeoutMs);
    if (!res) return null;
    const body = Buffer.from(await res.arrayBuffer());
    return body.length > MAX_BODY_BYTES ? null : body;
}

async function fetchExternal(rawUrl: string, timeoutMs: number): Promise<Response | null> {
    let target = rawUrl.trim();
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const url = await assertUrlIsSafe(target);

        const res = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "User-Agent": "RMAST-SalesEngine/1.0 (+enrichment)" },
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) return null;
            target = new URL(location, url).toString();
            continue;
        }

        return res.ok ? res : null;
    }

    return null;
}
