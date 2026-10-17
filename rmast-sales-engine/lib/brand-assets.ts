import { inflateSync } from "zlib";
import { fetchExternalBytes, fetchExternalText } from "@/lib/safe-fetch";

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
    /** Whether the logo is drawn in light or dark colors, when that can be
     *  told (inline SVGs); decides what background it is shown on. */
    logoTone?: "light" | "dark";
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

// Review badges, app-store buttons and payment marks are often named "logo"
// too, and are someone else's brand.
const THIRD_PARTY_LOGO_RE =
    /(google|facebook|instagram|linkedin|twitter|youtube|tiktok|whatsapp|trustpilot|tripadvisor|apple|app-?store|play-?store|visa|mastercard|paypal|stripe|rera|dld|partner|developer|award)/i;

const STOCK_IMAGE_RE =
    /(irt-cdn\.multiscreensite\.com|images\.unsplash\.com|static\.wixstatic\.com\/media\/11062b_|site_background|stock[-_]?photo|shutterstock|istockphoto|gettyimages|pexels)/i;

function extractImages(html: string, base: string): { logoUrl?: string; images: string[] } {
    let logoUrl: string | undefined;
    const images: string[] = [];
    const seen = new Set<string>();

    const add = (raw: string | undefined) => {
        if (!raw) return;
        const url = resolveUrl(raw, base);
        if (!url || seen.has(url) || SKIP_IMAGE_RE.test(url) || /logo/i.test(url)) return;
        // Site builders (Duda, Wix) name resized copies like "photo-300w.jpg";
        // a thumbnail that small looks blurry stretched across a hero.
        const sizeHint = url.match(/[-_](\d{2,4})w\.(jpe?g|png|webp)/i);
        if (sizeHint && Number(sizeHint[1]) < 800) return;
        // Builders' shared stock libraries hold template defaults (Duda's
        // "site_background_education"), not the business's own photos.
        if (STOCK_IMAGE_RE.test(url)) return;
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

        const isDataUri = /^data:/i.test(src);
        // A data URI's base64 can contain short words like "rera" by chance,
        // so only a real path counts toward the label.
        const label = `${attr(tag, "alt") || ""} ${attr(tag, "class") || ""} ${attr(tag, "id") || ""} ${isDataUri ? "" : src}`;
        if (!logoUrl && /logo/i.test(label) && !THIRD_PARTY_LOGO_RE.test(label)) {
            // Inline SVG logos are common on modern builds, and an SVG shown
            // through <img> cannot run scripts, so a small one is fine as-is.
            if (/^data:image\/(svg\+xml|png|webp);/i.test(src)) {
                if (src.length < 60_000) logoUrl = src;
            } else {
                const url = resolveUrl(src, base);
                if (url) logoUrl = url;
            }
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
    // WordPress block-editor presets, present on every WordPress site
    "#007bff", "#0d6efd", "#dc3545", "#28a745", "#198754", "#ffc107", "#17a2b8", "#0dcaf0", // Bootstrap defaults
    "#f78da7", "#cf2e2e", "#ff6900", "#fcb900", "#7bdcb5", "#00d084", "#8ed1fc", "#0693e3", "#abb8c3", "#9b51e0",
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

    // Theme presets (WordPress and similar) declare a stock palette whether
    // or not the site uses it.
    css = css.replace(/--wp--preset--[w-]+s*:[^;}]*/gi, "");
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
        const { h, l } = hsl(parseColor(hex)!);
        // A navy and a sky blue are different brand colors even though they
        // share a hue, so a big lightness gap counts as distinct too.
        const distinct = picked.every((p) => {
            const other = hsl(parseColor(p)!);
            const diff = Math.abs(other.h - h);
            return Math.min(diff, 360 - diff) > 25 || Math.abs(other.l - l) > 0.25;
        });
        if (distinct) picked.push(hex);
        if (picked.length === 3) break;
    }
    return picked;
}

/** Reads the fill/stroke colors of an inline SVG logo and reports whether it
 *  is mostly light (made for a dark header) or mostly dark. */
/**
 * Reads a PNG logo's pixels and reports whether its visible pixels are mostly
 * light or mostly dark. PNG is the common case for logos (transparent
 * background); a minimal decoder over Node's zlib avoids an image library.
 * Returns undefined for anything it can't read confidently.
 */
function pngTone(buf: Buffer): BrandAssets["logoTone"] {
    if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return undefined;

    let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
    let palette: Buffer | undefined;
    let paletteAlpha: Buffer | undefined;
    const idat: Buffer[] = [];
    for (let pos = 8; pos + 8 <= buf.length;) {
        const length = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + length);
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === "PLTE") palette = data;
        else if (type === "tRNS") paletteAlpha = data;
        else if (type === "IDAT") idat.push(data);
        else if (type === "IEND") break;
        pos += 12 + length;
    }

    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (!channels || interlace !== 0 || !width || !height || width * height > 4_000_000) return undefined;
    if (depth !== 8 && !(colorType === 3 && [1, 2, 4].includes(depth))) return undefined;

    let raw: Buffer;
    try {
        raw = inflateSync(Buffer.concat(idat));
    } catch {
        return undefined;
    }

    const bpp = Math.max(1, (channels * depth) / 8);
    const stride = Math.ceil((width * channels * depth) / 8);
    if (raw.length < (stride + 1) * height) return undefined;

    // Undo PNG's per-row filters (None, Sub, Up, Average, Paeth).
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : undefined;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? row[x - bpp] : 0;
            const b = prev ? prev[x] : 0;
            const c = prev && x >= bpp ? prev[x - bpp] : 0;
            let value = src[x];
            if (filter === 1) value += a;
            else if (filter === 2) value += b;
            else if (filter === 3) value += Math.floor((a + b) / 2);
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            row[x] = value & 0xff;
        }
    }

    let light = 0;
    let dark = 0;
    const step = Math.max(1, Math.floor((width * height) / 20000));
    for (let i = 0; i < width * height; i += step) {
        const x = i % width;
        const y = Math.floor(i / width);
        let r: number, g: number, b: number, alpha = 255;
        if (colorType === 3) {
            const bitIndex = x * depth;
            const byte = pixels[y * stride + (bitIndex >> 3)];
            const index = (byte >> (8 - depth - (bitIndex & 7))) & ((1 << depth) - 1);
            if (!palette || index * 3 + 2 >= palette.length) continue;
            [r, g, b] = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
            if (paletteAlpha && index < paletteAlpha.length) alpha = paletteAlpha[index];
        } else {
            const o = y * stride + x * channels;
            if (colorType === 0 || colorType === 4) {
                r = g = b = pixels[o];
                if (colorType === 4) alpha = pixels[o + 1];
            } else {
                [r, g, b] = [pixels[o], pixels[o + 1], pixels[o + 2]];
                if (colorType === 6) alpha = pixels[o + 3];
            }
        }
        if (alpha < 128) continue;
        const l = hsl({ r, g, b }).l;
        if (l > 0.7) light++;
        else if (l < 0.35) dark++;
    }

    const visible = light + dark;
    if (visible < 20) return undefined;
    // An opaque logo with a baked-in background shows fine anywhere.
    if (light / visible > 0.75) return "light";
    if (dark / visible > 0.75) return "dark";
    return undefined;
}

async function logoTone(logoUrl?: string): Promise<BrandAssets["logoTone"]> {
    const svgTone = logoToneOf(logoUrl);
    if (svgTone || !logoUrl || !/\.png(\?|$)/i.test(logoUrl)) return svgTone;
    try {
        const bytes = await fetchExternalBytes(logoUrl);
        return bytes ? pngTone(bytes) : undefined;
    } catch {
        return undefined;
    }
}

function logoToneOf(logoUrl?: string): BrandAssets["logoTone"] {
    const match = logoUrl?.match(/^data:image\/svg\+xml;base64,(.+)$/i);
    if (!match) return undefined;
    let svg: string;
    try {
        svg = Buffer.from(match[1], "base64").toString("utf8");
    } catch {
        return undefined;
    }
    let light = 0;
    let dark = 0;
    for (const m of svg.matchAll(/(?:fill|stroke)\s*[=:]\s*"?\s*(#[0-9a-f]{3,6}\b|white|black)/gi)) {
        const value = m[1].toLowerCase();
        const rgb = value === "white" ? { r: 255, g: 255, b: 255 } : value === "black" ? { r: 0, g: 0, b: 0 } : parseColor(value);
        if (!rgb) continue;
        if (hsl(rgb).l > 0.7) light++;
        else if (hsl(rgb).l < 0.35) dark++;
    }
    if (light === dark) return undefined;
    return light > dark ? "light" : "dark";
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

    return { logoUrl, logoTone: await logoTone(logoUrl), images, colors: extractColors(css, declared) };
}
