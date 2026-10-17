import { fetchExternalText } from "@/lib/safe-fetch";

/**
 * Pulls a business's own branding off its website: logo, real photos, and the
 * colors its site is actually built with. The demo uses these so it looks like
 * *their* brand rather than one the model made up.
 *
 * Social profiles would be the other obvious source, but Instagram and
 * Facebook block unauthenticated fetches, and a business's website almost
 * always carries the same logo and colors anyway.
 *
 * Everything here is best-effort: a site that can't be read just yields no
 * assets, and the demo falls back to its generated artwork and AI palette.
 */

export interface BrandAssets {
    logoUrl?: string;
    images: string[];
    /** Most prominent brand colors, strongest first, as #rrggbb. */
    colors: string[];
}

const EMPTY: BrandAssets = { images: [], colors: [] };
const MAX_IMAGES = 8;
const MAX_STYLESHEETS = 2;

function resolveUrl(raw: string, base: string): string | null {
    try {
        const url = new URL(raw.trim().replace(/&amp;/g, "&"), base);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function attr(tag: string, name: string): string | undefined {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    return match ? (match[2] ?? match[3] ?? match[4]) : undefined;
}

/** Picks the largest candidate out of a srcset, which is usually the real photo. */
function bestFromSrcset(srcset: string): string | undefined {
    const candidates = srcset
        .split(",")
        .map((part) => {
            const [url, size] = part.trim().split(/\s+/);
            return { url, weight: parseFloat(size) || 0 };
        })
        .filter((c) => c.url);
    candidates.sort((a, b) => b.weight - a.weight);
    return candidates[0]?.url;
}

const SKIP_IMAGE_RE =
    /(sprite|icon|favicon|pixel|spacer|blank|placeholder|loader|spinner|badge|flag|avatar|emoji|gravatar|tracking|facebook\.com\/tr|\.svg(\?|$)|\.gif(\?|$)|data:)/i;

function extractImages(html: string, base: string): { logoUrl?: string; images: string[] } {
    let logoUrl: string | undefined;
    const images: string[] = [];
    const seen = new Set<string>();

    const add = (raw: string | undefined) => {
        if (!raw) return;
        const url = resolveUrl(raw, base);
        if (!url || seen.has(url) || SKIP_IMAGE_RE.test(url)) return;
        seen.add(url);
        images.push(url);
    };

    // The share image is chosen by the business itself, so it leads.
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
        if (key === "og:image" || key === "twitter:image") add(attr(tag, "content"));
    }

    for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
        // Next.js/lazy-loading sites keep the real URL in data-* attributes.
        const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
        const src =
            (srcset && bestFromSrcset(srcset)) || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "src");
        if (!src) continue;

        const label = `${attr(tag, "alt") || ""} ${attr(tag, "class") || ""} ${attr(tag, "id") || ""} ${src}`;
        if (!logoUrl && /logo/i.test(label)) {
            const url = resolveUrl(src, base);
            if (url && !/^data:/i.test(src)) logoUrl = url;
            continue;
        }

        const width = parseInt(attr(tag, "width") || "", 10);
        const height = parseInt(attr(tag, "height") || "", 10);
        if ((width && width < 200) || (height && height < 150)) continue;
        add(src);
    }

    // Hero sections are often CSS backgrounds rather than <img> tags.
    for (const match of html.matchAll(/background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) {
        add(match[2]);
    }

    return { logoUrl, images: images.slice(0, MAX_IMAGES) };
}

// --- Colors -------------------------------------------------------------------

function toHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function parseColor(raw: string): { r: number; g: number; b: number } | null {
    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    const rgb = raw.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
    return rgb ? { r: +rgb[1], g: +rgb[2], b: +rgb[3] } : null;
}

function hsl({ r, g, b }: { r: number; g: number; b: number }) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s, l };
}

/**
 * Ranks the colors a site uses by how often they appear, ignoring grays,
 * near-white and near-black (every site has those), and keeps only colors
 * with clearly different hues so the result is a real brand palette rather
 * than five shades of the same blue. Colors the site declares on purpose
 * (theme-color, CSS custom properties) count extra.
 */
// Share/chat buttons (WhatsApp, Facebook, ...) are on most small-business
// sites and would otherwise outrank the actual brand colors.
const THIRD_PARTY_COLORS = new Set([
    "#25d366", "#128c7e", "#075e54", // WhatsApp
    "#1877f2", "#3b5998", "#4267b2", // Facebook
    "#e4405f", "#c13584", "#833ab4", "#fd1d1d", "#f56040", "#fcaf45", // Instagram
    "#0a66c2", "#0077b5", // LinkedIn
    "#1da1f2", // Twitter
    "#ff0000", "#cc0000", // YouTube
    "#ea4335", "#4285f4", "#34a853", "#fbbc05", // Google
]);

function extractColors(css: string, declared: string[]): string[] {
    const counts = new Map<string, number>();
    const bump = (raw: string, weight: number) => {
        const rgb = parseColor(raw);
        if (!rgb) return;
        const { s, l } = hsl(rgb);
        if (s < 0.25 || l < 0.08 || l > 0.92) return;
        const hex = toHex(rgb.r, rgb.g, rgb.b);
        if (THIRD_PARTY_COLORS.has(hex)) return;
        counts.set(hex, (counts.get(hex) || 0) + weight);
    };

    declared.forEach((c) => bump(c, 25));
    for (const m of css.matchAll(/--[\w-]*(?:primary|brand|accent|main|secondary)[\w-]*\s*:\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/gi)) {
        bump(m[1], 10);
    }
    for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+[^)]*\)/gi)) {
        bump(m[0], 1);
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
    const picked: string[] = [];
    for (const hex of ranked) {
        const { h } = hsl(parseColor(hex)!);
        const distinct = picked.every((p) => {
            const diff = Math.abs(hsl(parseColor(p)!).h - h);
            return Math.min(diff, 360 - diff) > 25;
        });
        if (distinct) picked.push(hex);
        if (picked.length === 3) break;
    }
    return picked;
}

export async function fetchBrandAssets(website?: string): Promise<BrandAssets> {
    if (!website) return EMPTY;
    const base = /^https?:\/\//i.test(website) ? website : `https://${website}`;

    let html: string | null = null;
    try {
        html = await fetchExternalText(base);
    } catch {
        return EMPTY;
    }
    if (!html) return EMPTY;

    const { logoUrl, images } = extractImages(html, base);

    const declared: string[] = [];
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const name = (attr(tag, "name") || "").toLowerCase();
        if (name === "theme-color" || name === "msapplication-tilecolor") {
            const content = attr(tag, "content");
            if (content) declared.push(content);
        }
    }

    // Inline styles plus the first couple of the site's own stylesheets;
    // third-party CSS (fonts, widgets) would only add noise.
    let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
    css += "\n" + [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join("\n");
    const host = new URL(base).host;
    const sheets = (html.match(/<link\b[^>]*>/gi) || [])
        .filter((tag) => /stylesheet/i.test(attr(tag, "rel") || ""))
        .map((tag) => resolveUrl(attr(tag, "href") || "", base))
        .filter((url): url is string => !!url && new URL(url).host === host)
        .slice(0, MAX_STYLESHEETS);
    for (const sheet of sheets) {
        try {
            css += "\n" + ((await fetchExternalText(sheet)) || "");
        } catch {
            // One unreadable stylesheet shouldn't cost us the rest.
        }
    }

    return { logoUrl, images, colors: extractColors(css, declared) };
}
