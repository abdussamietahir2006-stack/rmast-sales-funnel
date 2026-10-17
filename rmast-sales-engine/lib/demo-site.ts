/**
 * Renders a personalized, multi-page demo website from an AI-written brief.
 *
 * The model decides everything creative (copy, palette, fonts, which page
 * fits the business, the visual style); this file turns that into markup.
 * Asking the model for five pages of raw HTML instead reliably ran into
 * output limits and came back truncated or broken. A template driven by the
 * brief always produces a complete, valid site in one pass.
 *
 * The result is a single HTML document with five "pages" switched by a small
 * script, because the demo is shown via srcDoc in a sandboxed iframe that
 * cannot navigate between real URLs.
 */

export type DemoStyle = "bold" | "elegant" | "warm" | "minimal";

interface Card {
    title: string;
    text: string;
}

export interface DemoSiteBrief {
    demoDescription: string;
    siteName: string;
    tagline: string;
    style: DemoStyle;
    colorPalette: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        text: string;
    };
    headingFont: string;
    bodyFont: string;
    home: {
        heroHeadline: string;
        heroSubheadline: string;
        primaryCta: string;
        introHeading: string;
        introCopy: string;
        highlights: Card[];
    };
    about: {
        heading: string;
        intro: string;
        story: string[];
        values: Card[];
    };
    services: {
        heading: string;
        intro: string;
        items: { name: string; description: string }[];
    };
    showcase: {
        navLabel: string;
        heading: string;
        intro: string;
        items: { title: string; text: string; tag: string }[];
    };
    testimonials: { quote: string; name: string; role: string }[];
    faq: { question: string; answer: string }[];
    contact: { heading: string; intro: string };
    ctaHeadline: string;
    ctaText: string;
}

export interface DemoBusiness {
    companyName: string;
    niche: string;
    location: string;
    market: string;
    phone?: string;
    email?: string;
    problems?: string[];
    /** The business's own logo and photos, scraped from its website. */
    logoUrl?: string;
    logoTone?: "light" | "dark";
    images?: string[];
}

const STYLES: DemoStyle[] = ["bold", "elegant", "warm", "minimal"];
const DEFAULT_PALETTE = {
    primary: "#0F172A",
    secondary: "#334155",
    accent: "#F59E0B",
    background: "#FFFFFF",
    text: "#0F172A",
};
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_RE = /^[A-Za-z0-9 ]{2,40}$/;

// --- Normalizing the model's brief ------------------------------------------

function str(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list<T>(value: unknown, max: number, pick: (item: Record<string, unknown>) => T | null): T[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => (item && typeof item === "object" ? pick(item as Record<string, unknown>) : null))
        .filter((item): item is T => item !== null)
        .slice(0, max);
}

function card(item: Record<string, unknown>): Card | null {
    const title = str(item.title);
    const text = str(item.text);
    return title && text ? { title, text } : null;
}

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Fills in anything the model omitted or returned malformed, so a partial
 *  response still renders a complete five-page site rather than crashing. */
export function normalizeDemoSiteBrief(rawInput: unknown, biz: DemoBusiness): DemoSiteBrief {
    const raw = obj(rawInput);
    const palette = obj(raw.colorPalette);
    const color = (key: keyof typeof DEFAULT_PALETTE) => {
        const value = palette[key];
        return typeof value === "string" && HEX_COLOR_RE.test(value) ? value : DEFAULT_PALETTE[key];
    };
    const font = (value: unknown, fallback: string) =>
        typeof value === "string" && FONT_RE.test(value.trim()) ? value.trim() : fallback;

    const home = obj(raw.home);
    const about = obj(raw.about);
    const services = obj(raw.services);
    const showcase = obj(raw.showcase);
    const contact = obj(raw.contact);

    const fallbackHighlights = (biz.problems || []).slice(0, 3).map((p) => ({
        title: "Fixed in this design",
        text: p,
    }));

    return {
        demoDescription: str(raw.demoDescription, `A personalized five-page demo website for ${biz.companyName}.`),
        siteName: str(raw.siteName, biz.companyName),
        tagline: str(raw.tagline, `${biz.niche} in ${biz.location}`),
        style: STYLES.includes(raw.style as DemoStyle) ? (raw.style as DemoStyle) : "bold",
        colorPalette: {
            primary: color("primary"),
            secondary: color("secondary"),
            accent: color("accent"),
            background: color("background"),
            text: color("text"),
        },
        headingFont: font(raw.headingFont, "Manrope"),
        bodyFont: font(raw.bodyFont, "Inter"),
        home: {
            heroHeadline: str(home.heroHeadline, biz.companyName),
            heroSubheadline: str(home.heroSubheadline, `${biz.niche} in ${biz.location}, ${biz.market}.`),
            primaryCta: str(home.primaryCta, "Get in touch"),
            introHeading: str(home.introHeading, `Why ${biz.companyName}`),
            introCopy: str(home.introCopy),
            highlights: list(home.highlights, 3, card).length
                ? list(home.highlights, 3, card)
                : fallbackHighlights,
        },
        about: {
            heading: str(about.heading, `About ${biz.companyName}`),
            intro: str(about.intro),
            story: (Array.isArray(about.story) ? about.story : [])
                .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
                .slice(0, 3),
            values: list(about.values, 3, card),
        },
        services: {
            heading: str(services.heading, "Services"),
            intro: str(services.intro),
            items: list(services.items, 6, (i) => {
                const name = str(i.name);
                const description = str(i.description);
                return name && description ? { name, description } : null;
            }),
        },
        showcase: {
            navLabel: str(showcase.navLabel, "Work").slice(0, 18),
            heading: str(showcase.heading, "Our work"),
            intro: str(showcase.intro),
            items: list(showcase.items, 6, (i) => {
                const title = str(i.title);
                const text = str(i.text);
                return title && text ? { title, text, tag: str(i.tag) } : null;
            }),
        },
        testimonials: list(raw.testimonials, 3, (t) => {
            const quote = str(t.quote);
            return quote ? { quote, name: str(t.name, "Customer"), role: str(t.role) } : null;
        }),
        faq: list(raw.faq, 5, (f) => {
            const question = str(f.question);
            const answer = str(f.answer);
            return question && answer ? { question, answer } : null;
        }),
        contact: {
            heading: str(contact.heading, "Get in touch"),
            intro: str(contact.intro, `Reach out to ${biz.companyName} today.`),
        },
        ctaHeadline: str(raw.ctaHeadline, "Ready to get started?"),
        ctaText: str(raw.ctaText, `Talk to ${biz.companyName} today.`),
    };
}

// --- Rendering ----------------------------------------------------------------

function esc(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function luminance(hex: string): number {
    const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(full.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text color to sit on top of a given fill. */
/** WCAG contrast ratio between two colors (1 to 21). */
function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function onColor(hex: string): string {
    return luminance(hex) > 0.4 ? "#111111" : "#FFFFFF";
}

const ICONS = [
    '<path d="M5 12l5 5L20 7"/>',
    '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>',
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z"/>',
    '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
];

function icon(index: number): string {
    return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[index % ICONS.length]}</svg>`;
}

/** A decorative panel in the brand's own colors. Stock-photo services
 *  either need an API key or return unrelated pictures (and the free one
 *  used before went down entirely), so the visuals are drawn instead:
 *  layered gradients plus one of three patterns, which can never fail to load. */
function art(variant: number, cls: string, inner = "", photo?: string): string {
    // A real photo sits on top of the artwork; if it fails to load (hotlink
    // protection, a dead URL) it removes itself and the artwork shows instead.
    const img = photo
        ? `<img src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-photo');this.remove()">`
        : "";
    return `<div class="art art-${variant % 3} ${cls}${photo ? " has-photo" : ""}">${img}${inner}</div>`;
}

function initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Gives the logo a backing only when it would otherwise vanish: a light
 *  logo on a light page sits on the brand color, a dark (or unknown) logo on
 *  a dark page sits on white. */
function logoBacking(tone: DemoBusiness["logoTone"], p: DemoSiteBrief["colorPalette"]): string {
    const darkPage = luminance(p.background) < 0.3;
    if (tone === "light") return darkPage ? "" : `background:${p.primary};padding:6px 10px;`;
    return darkPage ? "background:rgba(255,255,255,.94);padding:4px 8px;" : "";
}

const PAGE_IDS = ["home", "about", "services", "showcase", "contact"] as const;

export function renderDemoSite(brief: DemoSiteBrief, biz: DemoBusiness): string {
    const p = brief.colorPalette;
    const photos = biz.images || [];
    const navLabels: Record<(typeof PAGE_IDS)[number], string> = {
        home: "Home",
        about: "About",
        services: "Services",
        showcase: brief.showcase.navLabel,
        contact: "Contact",
    };
    const fonts = [brief.headingFont, brief.bodyFont]
        .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800`)
        .join("&");

    const radius = { bold: "18px", elegant: "4px", warm: "28px", minimal: "10px" }[brief.style];
    const headingWeight = brief.style === "elegant" ? 500 : 800;
    const heroClass = `hero-${brief.style}`;

    const nav = PAGE_IDS.map(
        (id) => `<a href="#${id}" data-page="${id}">${esc(navLabels[id])}</a>`
    ).join("");

    const cta = (label: string) =>
        `<a href="#contact" data-page="contact" class="btn btn-primary">${esc(label)}</a>`;

    const ctaBand = `
<section class="cta-band reveal">
  <div class="wrap cta-inner">
    <div><h2>${esc(brief.ctaHeadline)}</h2><p>${esc(brief.ctaText)}</p></div>
    ${cta(brief.home.primaryCta)}
  </div>
</section>`;

    const testimonials = brief.testimonials.length
        ? `
<section class="wrap block reveal">
  <p class="eyebrow">What customers say</p>
  <div class="grid grid-3">
    ${brief.testimonials
            .map(
                (t) => `<figure class="card quote"><blockquote>&ldquo;${esc(t.quote)}&rdquo;</blockquote><figcaption><strong>${esc(t.name)}</strong>${t.role ? `<span>${esc(t.role)}</span>` : ""}</figcaption></figure>`
            )
            .join("")}
  </div>
  <p class="sample-note">Example reviews for this demo; real ones go here.</p>
</section>`
        : "";

    const home = `
<section class="page" id="page-home">
  <header class="hero ${heroClass}">
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <p class="eyebrow">${esc(brief.tagline)}</p>
        <h1>${esc(brief.home.heroHeadline)}</h1>
        <p class="lead">${esc(brief.home.heroSubheadline)}</p>
        <div class="actions">${cta(brief.home.primaryCta)}<a href="#services" data-page="services" class="btn btn-ghost">Explore services</a></div>
      </div>
      ${art(0, "hero-img", `<span class="art-mark">${esc(initials(brief.siteName))}</span>${brief.home.highlights.length ? `<div class="chips">${brief.home.highlights.map((h, i) => `<span class="chip" style="--d:${300 + i * 150}ms">${icon(i)}${esc(h.title)}</span>`).join("")}</div>` : ""}`, photos[0])}
    </div>
  </header>
  ${brief.home.highlights.length
            ? `<section class="wrap block"><div class="grid grid-3">${brief.home.highlights
                .map(
                    (h, i) => `<div class="card reveal" style="--d:${i * 90}ms">${icon(i)}<h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`
                )
                .join("")}</div></section>`
            : ""
        }
  ${brief.home.introCopy
            ? `<section class="wrap block split reveal">${art(1, "split-img", icon(4), photos[1])}<div><p class="eyebrow">${esc(navLabels.about)}</p><h2>${esc(brief.home.introHeading)}</h2><p>${esc(brief.home.introCopy)}</p><a href="#about" data-page="about" class="link">Our story &rarr;</a></div></section>`
            : ""
        }
  ${brief.services.items.length
            ? `<section class="wrap block reveal"><div class="row-head"><div><p class="eyebrow">Services</p><h2>${esc(brief.services.heading)}</h2></div><a href="#services" data-page="services" class="link">All services &rarr;</a></div><div class="grid grid-3">${brief.services.items
                .slice(0, 3)
                .map((s, i) => `<div class="card">${icon(i + 3)}<h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></div>`)
                .join("")}</div></section>`
            : ""
        }
  ${testimonials}
  ${ctaBand}
</section>`;

    const pageHead = (eyebrow: string, heading: string, intro: string) => `
<header class="page-head">
  <div class="wrap"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(heading)}</h1>${intro ? `<p class="lead">${esc(intro)}</p>` : ""}</div>
</header>`;

    const about = `
<section class="page" id="page-about" hidden>
  ${pageHead("About us", brief.about.heading, brief.about.intro)}
  <section class="wrap block split reveal">
    <div class="story">${brief.about.story.map((s) => `<p>${esc(s)}</p>`).join("") || `<p>${esc(brief.home.introCopy)}</p>`}</div>
    ${art(2, "split-img", icon(2), photos[2])}
  </section>
  ${brief.about.values.length
            ? `<section class="wrap block reveal"><p class="eyebrow">What we stand for</p><div class="grid grid-3">${brief.about.values
                .map((v, i) => `<div class="card">${icon(i + 1)}<h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></div>`)
                .join("")}</div></section>`
            : ""
        }
  ${ctaBand}
</section>`;

    const services = `
<section class="page" id="page-services" hidden>
  ${pageHead("Services", brief.services.heading, brief.services.intro)}
  <section class="wrap block">
    <div class="svc-list">
      ${brief.services.items
            .map(
                (s, i) => `<div class="svc reveal" style="--d:${(i % 3) * 80}ms"><span class="svc-num">${String(i + 1).padStart(2, "0")}</span><div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></div><a href="#contact" data-page="contact" class="link">Enquire &rarr;</a></div>`
            )
            .join("")}
    </div>
  </section>
  ${ctaBand}
</section>`;

    const showcase = `
<section class="page" id="page-showcase" hidden>
  ${pageHead(brief.showcase.navLabel, brief.showcase.heading, brief.showcase.intro)}
  <section class="wrap block">
    <div class="grid grid-3">
      ${brief.showcase.items
            .map(
                (s, i) => `<article class="card show reveal" style="--d:${(i % 3) * 80}ms">${art(i, "show-img", `<span class="art-num">${String(i + 1).padStart(2, "0")}</span>`, photos[3 + i])}<div class="show-body">${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ""}<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></article>`
            )
            .join("")}
    </div>
  </section>
  ${testimonials}
  ${ctaBand}
</section>`;

    const contactDetails = [
        `<li>${icon(3)}<span>${esc(biz.location)}, ${esc(biz.market)}</span></li>`,
        biz.phone ? `<li>${icon(5)}<span>${esc(biz.phone)}</span></li>` : "",
        biz.email ? `<li>${icon(0)}<span>${esc(biz.email)}</span></li>` : "",
    ].join("");

    const contact = `
<section class="page" id="page-contact" hidden>
  ${pageHead("Contact", brief.contact.heading, brief.contact.intro)}
  <section class="wrap block split contact-split">
    <div>
      <ul class="details">${contactDetails}</ul>
      ${brief.faq.length
            ? `<div class="faq"><h3>Common questions</h3>${brief.faq
                .map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`)
                .join("")}</div>`
            : ""
        }
    </div>
    <form class="card form" novalidate>
      <h3>Send a message</h3>
      <label>Name<input name="name" required autocomplete="name"></label>
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Phone <span class="opt">(optional)</span><input name="phone" type="tel" autocomplete="tel"></label>
      <label>How can we help?<textarea name="message" rows="4" required></textarea></label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Send message</button>
      <div class="form-success" hidden>${icon(0)}<p>Thanks! We'll get back to you shortly.</p></div>
    </form>
  </section>
</section>`;

    const css = `
:root{--primary:${p.primary};--secondary:${p.secondary};--accent:${p.accent};--bg:${p.background};--text:${p.text};
--on-primary:${onColor(p.primary)};--on-accent:${onColor(p.accent)};--on-secondary:${onColor(p.secondary)};
--surface:color-mix(in srgb,var(--text) 5%,var(--bg));--line:color-mix(in srgb,var(--text) 12%,transparent);
--muted:color-mix(in srgb,var(--text) 68%,var(--bg));--r:${radius};
--hf:'${brief.headingFont}',system-ui,sans-serif;--bf:'${brief.bodyFont}',system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--bf);background:var(--bg);color:var(--text);line-height:1.65;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--hf);font-weight:${headingWeight};line-height:1.12;letter-spacing:-.02em}
h1{font-size:clamp(2.1rem,4.4vw,3.5rem);text-wrap:balance}h2{text-wrap:balance}h2{font-size:clamp(1.7rem,3.4vw,2.6rem);margin-bottom:.6em}h3{font-size:1.2rem;margin-bottom:.4em}
p{color:var(--muted)}a{color:inherit}
.wrap{width:min(1160px,100% - 40px);margin-inline:auto}
.block{padding:clamp(56px,8vw,96px) 0}
.eyebrow{font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.lead{font-size:clamp(1.05rem,1.6vw,1.25rem);max-width:58ch;margin-top:18px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 26px;border-radius:var(--r);font-weight:700;text-decoration:none;border:2px solid transparent;cursor:pointer;font:inherit;font-weight:700;transition:transform .2s,box-shadow .2s,background .2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px -10px color-mix(in srgb,var(--primary) 70%,transparent)}
.btn-primary{background:var(--accent);color:var(--on-accent)}
.btn-ghost{border-color:currentColor;background:transparent}
.link{font-weight:700;color:var(--accent);text-decoration:none;white-space:nowrap}.link:hover{text-decoration:underline}
.nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:72px}
.brand{font-family:var(--hf);font-weight:800;font-size:1.25rem;text-decoration:none;letter-spacing:-.02em}
.brand span{color:var(--accent)}
.links{display:flex;gap:6px;align-items:center}
.links a{text-decoration:none;font-weight:600;font-size:.95rem;padding:8px 14px;border-radius:999px;transition:background .2s,color .2s}
.links a:hover{background:var(--surface)}
.links a.active{background:var(--accent);color:var(--on-accent)}
.burger{display:none;background:none;border:0;width:44px;height:44px;cursor:pointer;color:inherit}
.burger span{display:block;width:24px;height:2px;background:currentColor;margin:5px auto;transition:transform .25s,opacity .25s}
.hero{padding:clamp(56px,9vw,120px) 0;overflow:hidden}
.hero-inner{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}
.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px}
.hero-bold{background:var(--primary);color:var(--on-primary)}.hero-bold p{color:color-mix(in srgb,var(--on-primary) 78%,transparent)}.hero-bold .eyebrow{color:${contrast(p.accent, p.primary) >= 3 ? "var(--accent)" : "var(--on-primary)"}}
.hero-warm{background:radial-gradient(1200px 500px at 85% 0%,color-mix(in srgb,var(--accent) 22%,transparent),transparent),var(--surface)}
.hero-elegant{border-bottom:1px solid var(--line)}.hero-elegant h1{font-style:italic}
.hero-minimal{background:var(--bg)}
.art{position:relative;overflow:hidden;border-radius:var(--r);display:grid;place-items:center;color:#fff;isolation:isolate;
background:radial-gradient(circle at 18% 22%,color-mix(in srgb,var(--accent) 75%,transparent),transparent 46%),radial-gradient(circle at 85% 80%,color-mix(in srgb,var(--secondary) 90%,transparent),transparent 55%),linear-gradient(140deg,var(--primary),color-mix(in srgb,var(--primary) 55%,var(--secondary)))}
.art::before{content:'';position:absolute;inset:0;z-index:-1;opacity:.22}
.art-0::before{background:repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 34px),repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 34px);mask:radial-gradient(circle at 70% 30%,#000,transparent 75%)}
.art-1::before{background:repeating-radial-gradient(circle at 80% 20%,#fff 0 1px,transparent 1px 22px)}
.art-2::before{background:repeating-linear-gradient(45deg,#fff 0 1px,transparent 1px 18px);mask:linear-gradient(160deg,#000,transparent 80%)}
.art::after{content:'';position:absolute;width:55%;aspect-ratio:1;border-radius:50%;right:-12%;top:-14%;z-index:-1;background:color-mix(in srgb,var(--accent) 35%,transparent);filter:blur(40px);transition:transform .8s}
.art:hover::after{transform:translate(-10%,10%) scale(1.1)}
.art .ico{width:72px;height:72px;padding:16px;margin:0;background:rgba(255,255,255,.14);color:#fff;backdrop-filter:blur(6px);border-radius:20px}
.art>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;transition:transform .8s}
.art.has-photo:hover>img{transform:scale(1.04)}
.has-photo::after{width:auto;aspect-ratio:auto;inset:0;right:0;top:0;border-radius:0;filter:none;transform:none!important;background:linear-gradient(to top,rgba(0,0,0,.6),rgba(0,0,0,.05) 55%)}
.has-photo>.art-mark,.has-photo>.ico,.has-photo>.art-num{display:none}
.brand{display:inline-flex;align-items:center;gap:10px}
.logo{height:38px;width:auto;max-width:140px;object-fit:contain;border-radius:8px;${logoBacking(biz.logoTone, p)}}
.art-mark{font-family:var(--hf);font-weight:800;font-size:clamp(4rem,9vw,7rem);letter-spacing:-.04em;opacity:.9;line-height:1}
.art-num{font-family:var(--hf);font-weight:800;font-size:3.4rem;opacity:.85}
.chips{position:absolute;left:20px;right:20px;bottom:20px;display:grid;gap:10px}
.chip{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:calc(var(--r) / 1.5);background:rgba(255,255,255,.12);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.18);font-weight:600;font-size:.9rem;animation:chipin .6s ease var(--d) both}
.chip .ico{width:28px;height:28px;padding:5px;border-radius:8px;background:var(--accent);color:var(--on-accent);backdrop-filter:none}
@keyframes chipin{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.hero-img{aspect-ratio:4/5;box-shadow:0 30px 60px -30px rgba(0,0,0,.45)}
.split-img{aspect-ratio:4/3}.show-img{aspect-ratio:16/10;border-radius:0}
.grid{display:grid;gap:22px}.grid-3{grid-template-columns:repeat(3,1fr)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:28px;transition:transform .25s,box-shadow .25s}
.card:hover{transform:translateY(-4px);box-shadow:0 18px 40px -24px rgba(0,0,0,.35)}
.ico{width:42px;height:42px;padding:9px;border-radius:12px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);margin-bottom:18px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.row-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:28px}
.page-head{padding:clamp(56px,8vw,100px) 0 clamp(24px,4vw,40px);background:var(--surface);border-bottom:1px solid var(--line)}
.story p{font-size:1.08rem;margin-bottom:1.1em}
.svc-list{display:grid;gap:14px}
.svc{display:grid;grid-template-columns:auto 1fr auto;gap:28px;align-items:center;padding:28px;border:1px solid var(--line);border-radius:var(--r);transition:background .2s,transform .2s}
.svc:hover{background:var(--surface);transform:translateX(4px)}
.svc-num{font-family:var(--hf);font-size:2rem;font-weight:800;color:var(--accent)}
.show{padding:0;overflow:hidden}.show-body{padding:24px}
.tag{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);margin-bottom:10px}
.quote blockquote{font-size:1.05rem;color:var(--text);margin-bottom:18px}
.quote figcaption{display:flex;flex-direction:column;font-size:.9rem}.quote figcaption span{color:var(--muted)}
.sample-note{font-size:.78rem;margin-top:14px;opacity:.7}
.cta-band{background:var(--secondary);color:var(--on-secondary);padding:clamp(48px,7vw,80px) 0}
.cta-band p{color:color-mix(in srgb,var(--on-secondary) 80%,transparent)}
.cta-inner{display:flex;justify-content:space-between;align-items:center;gap:32px}
.cta-inner h2{margin-bottom:.3em}
.contact-split{align-items:start}
.details{list-style:none;display:grid;gap:14px;margin-bottom:36px}
.details li{display:flex;align-items:center;gap:14px;font-weight:600}.details .ico{margin:0}
.faq h3{margin-bottom:12px}
.faq details{border-bottom:1px solid var(--line);padding:16px 0}
.faq summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::after{content:'+';color:var(--accent);font-size:1.3rem;line-height:1;transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{margin-top:10px}
.form{display:grid;gap:16px}
.form label{display:grid;gap:6px;font-weight:600;font-size:.92rem}
.form .opt{font-weight:400;color:var(--muted)}
.form input,.form textarea{font:inherit;padding:12px 14px;border:1.5px solid var(--line);border-radius:calc(var(--r) / 2);background:var(--bg);color:var(--text);transition:border-color .2s,box-shadow .2s}
.form input:focus,.form textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent)}
.form .invalid{border-color:#DC2626}
.form-error{color:#DC2626;font-size:.88rem;min-height:1em}
.form-success{display:flex;align-items:center;gap:12px;font-weight:600}.form-success .ico{margin:0}
footer{border-top:1px solid var(--line);padding:40px 0;font-size:.9rem}
.foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
.foot nav{display:flex;gap:18px;flex-wrap:wrap}.foot nav a{text-decoration:none;color:var(--muted)}.foot nav a:hover{color:var(--text)}
.credit{text-align:center;font-size:.75rem;opacity:.55;margin-top:24px}
.page{animation:pagein .45s ease}
@keyframes pagein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.reveal{opacity:0;transform:translateY(26px);transition:opacity .7s ease var(--d,0ms),transform .7s ease var(--d,0ms)}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.page{animation:none}}
@media (max-width:860px){
.hero-inner,.split{grid-template-columns:1fr;gap:36px}
.hero-img{aspect-ratio:16/11;order:-1}
.grid-3{grid-template-columns:1fr}
.burger{display:block}
.links{position:fixed;inset:72px 0 auto 0;flex-direction:column;align-items:stretch;gap:4px;padding:16px 20px 24px;background:var(--bg);border-bottom:1px solid var(--line);transform:translateY(-8px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.links a{padding:14px 16px;font-size:1.05rem}
.nav.open .links{opacity:1;transform:none;pointer-events:auto}
.nav.open .burger span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.nav.open .burger span:nth-child(2){opacity:0}
.nav.open .burger span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.svc{grid-template-columns:1fr;gap:10px}
.cta-inner,.row-head{flex-direction:column;align-items:flex-start}
}`;

    // Self-contained on purpose: the sandboxed iframe has no same-origin
    // access, so nothing here may touch window.parent, cookies or storage.
    const js = `
(function(){
var nav=document.querySelector('.nav');
var pages=['home','about','services','showcase','contact'];
var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12}):null;
function watch(root){root.querySelectorAll('.reveal:not(.in)').forEach(function(el){io?io.observe(el):el.classList.add('in');});}
function show(id){
  if(pages.indexOf(id)<0)id='home';
  pages.forEach(function(p){var el=document.getElementById('page-'+p);if(el)el.hidden=(p!==id);});
  document.querySelectorAll('.links a,.foot nav a').forEach(function(a){a.classList.toggle('active',a.getAttribute('data-page')===id);});
  nav.classList.remove('open');
  window.scrollTo(0,0);
  watch(document.getElementById('page-'+id));
}
document.addEventListener('click',function(e){
  var a=e.target.closest('[data-page]');
  if(!a)return;
  e.preventDefault();
  show(a.getAttribute('data-page'));
});
document.querySelector('.burger').addEventListener('click',function(){nav.classList.toggle('open');});
var form=document.querySelector('.form');
form.addEventListener('submit',function(e){
  e.preventDefault();
  var err=form.querySelector('.form-error');var bad=null;
  form.querySelectorAll('input,textarea').forEach(function(f){
    var v=f.value.trim();var ok=!f.required||v.length>0;
    if(ok&&f.type==='email'&&v)ok=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v);
    f.classList.toggle('invalid',!ok);if(!ok&&!bad)bad=f;
  });
  if(bad){err.textContent=bad.type==='email'&&bad.value.trim()?'Please enter a valid email address.':'Please fill in the required fields.';bad.focus();return;}
  err.textContent='';
  form.querySelectorAll('label,button,.form-error').forEach(function(el){el.hidden=true;});
  form.querySelector('.form-success').hidden=false;
});
show('home');
})();`;

    const [nameHead, ...nameRest] = brief.siteName.split(" ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(brief.siteName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fonts}&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<nav class="nav">
  <div class="wrap nav-inner">
    <a href="#home" data-page="home" class="brand">${biz.logoUrl ? `<img class="logo" src="${esc(biz.logoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${esc(nameHead)}${nameRest.length ? ` <span>${esc(nameRest.join(" "))}</span>` : ""}</a>
    <div class="links">${nav}</div>
    <button class="burger" type="button" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</nav>
<main>${home}${about}${services}${showcase}${contact}</main>
<footer>
  <div class="wrap">
    <div class="foot">
      <div><strong>${esc(brief.siteName)}</strong><p>${esc(brief.tagline)}</p></div>
      <nav>${nav}</nav>
    </div>
    <p class="credit">Demo built by RMAST STUDIO</p>
  </div>
</footer>
<script>${js}</script>
</body>
</html>`;
}
