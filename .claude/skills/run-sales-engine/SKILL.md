---
name: run-sales-engine
description: Run the RMAST sales funnel with Claude as the AI - find each active campaign's daily quota of new leads (small struggling brokerages and solo realtors) with web search, verify each is actively operating and research its owner, then write the activity check, analysis, enrichment, competitors, full business audit, five-page demo site and outreach drafts. Use when asked to run the sales engine, get or process leads, or for the daily scheduled run. Never sends messages; the operator clicks Send.
---

# Run the sales engine

You are the AI for the RMAST STUDIO sales engine (`rmast-sales-engine/`). The
app stores, validates and renders everything; you do the research and the
writing. All commands below run from `rmast-sales-engine/`.

**Never send any message.** You only draft. The operator reviews each lead in
the dashboard and clicks Send. Never change the Auto-Send setting.

**What matters most, in order:**
1. **The business is actively operating right now.** No lead is better than a
   dead one. Verify before you add it.
2. **The owner's details:** name, title, their own LinkedIn, and their direct
   business email and phone where publicly listed.
3. Complete, accurate contact and social details for the business.

## 0. Make sure the engine can reach the app

```bash
node scripts/engine.mjs status
```

`scripts/engine.mjs` talks to `ENGINE_URL` from `.env.local` (the deployed
Vercel app), or `http://localhost:3000` if that isn't set. If it can't connect
and `ENGINE_URL` is not set, start the local app in the background with
`npm run dev` and retry. If the database is unreachable, stop and report it.

## 1. Read the status

- `campaigns`: active campaigns, each with `niche`, `country`, `locations`,
  `dailyTarget`, `addedToday` and **`remainingToday`**, which is how many new
  leads to add for that campaign in this run (0 means it is done for today).
  Each campaign has its own quota; never shift one campaign's quota to another.
- `leadsWaitingForWork`: leads still needing pipeline work from earlier runs.

## 2. Find new leads

### Who to target

For each campaign with `remainingToday > 0`, find real-estate businesses in
its `country` and `locations` (for example California or Texas), mixing:

- **Solo realtors** and small teams (1-5 agents) working under their own name
  or a small brand.
- **Small independent brokerages that aren't progressing well:** few active
  listings, an outdated or missing website, little or stale social activity,
  few reviews. These benefit most from RMAST's services.

Skip big franchises' corporate pages, national portals, and large brokerages.
An agent at a big franchise office counts only if they run their own brand
and website.

Spread searches across many cities in the state (e.g. California: Los
Angeles, San Diego, Sacramento, Fresno, San Jose, Riverside, Bakersfield,
Santa Rosa...; Texas: Houston, Dallas, Austin, San Antonio, Fort Worth, El
Paso, Plano, Corpus Christi...). Useful sources: Google and Maps results,
Zillow and Realtor.com agent directories, Yelp, LinkedIn, Instagram, and the
state license lookups below.

### The active-status gate (required before adding)

Only add a business when you found **recent evidence it is operating**,
ideally from two of these, at least one from the last 90 days:

- A current, active **real-estate license** in the state lookup: California
  DRE (https://www2.dre.ca.gov/publicasp/pplinfo.asp) or Texas TREC
  (https://www.trec.texas.gov/apps/license-holder-search/). This is the
  strongest single signal.
- Recent Instagram, Facebook or LinkedIn posts by the realtor or brokerage.
- Current listings or recent sales on Zillow, Realtor.com or their own site.
- Recent Google, Zillow or Yelp reviews.

Skip anyone with an expired or cancelled license, social accounts silent for
over a year, no current listings, or closure signs. Note the evidence you
found; you'll need it for the `activity` section.

### Adding them

For each business that passes the gate, record what you actually found:

```json
[{ "companyName": "Business or realtor brand name", "niche": "Real Estate", "market": "USA",
   "location": "City, State", "website": "https://...", "phone": "+1...", "email": "" }]
```

- `companyName` and `market` are required; `niche` and `market` match the campaign.
- Never invent names, sites, phones or emails. Leave a field `""` if not found.

Write the list to a JSON file outside the repo (your scratchpad or temp
dir) and add it **with that campaign's id**:

```bash
node scripts/engine.mjs add-leads <file.json> <campaignId>
```

Duplicates are skipped automatically and don't count toward the quota.
Re-check `status` and keep going until each campaign's `remainingToday` is 0,
or searches genuinely stop turning up new active businesses.

## 3. Research and process each lead

```bash
node scripts/engine.mjs queue 10
```

For each lead (repeat `queue` until it is empty):

1. `node scripts/engine.mjs context <id>` gives the stored lead, `missing`
   (the steps still needed), `website.homepageText` (a fresh scrape),
   `website.note`, `brand` (their logo, photos and colors, used by the demo
   automatically) and `auditAreas`.
2. **Research thoroughly**, in this order:
   - **Owner:** who owns or runs it (for a solo realtor, the realtor). Find
     their full name, title (e.g. Broker/Owner, Realtor), their personal
     LinkedIn profile (linkedin.com/in/...), and their direct business email
     and phone if publicly listed on their site, license record, or profiles.
   - **License:** look them up in the CA DRE or TX TREC lookup and record the
     license number and status.
   - **Active status:** confirm the evidence from step 2 and look for more:
     date of the latest Instagram/LinkedIn post, current listings, latest
     reviews.
   - **Business contacts and socials:** website, office phone, email,
     Instagram, Facebook, LinkedIn company page.
   - **Their situation:** listing count, reviews, website quality, social
     activity, and 1-2 real local competitors doing better.
   Fetch other pages of their site (About, Team, Contact) when the homepage is thin.
3. Write one JSON file with **every section listed in `missing`** (schemas
   below) and submit it:

   ```bash
   node scripts/engine.mjs submit <id> <work.json>
   ```

4. Every section in the response should be `"ok": true` and `missing` empty.
   Fix and resubmit any failed section. If `stoppedReason` says the lead looks
   inactive, move on.

Do leads one at a time and submit each before starting the next, so a run
that stops early keeps everything finished. If usage is running short, stop
after the current lead; the rest stay queued for the next run.

## 4. Log the run

```bash
node scripts/engine.mjs log-run "California: added N (M fully processed). Texas: added N (M fully processed). Skipped K inactive. X still queued."
```

Then report the same summary.

---

## Section schemas and rules

Write everything to the business owner as "you" where it is shown to them
(audit, demo, outreach). Plain text in every field, no markdown. Ground
everything in the context and your research; where information is missing,
say so instead of inventing it. Never invent reviews, prices, awards, years
in business, client counts or statistics.

RMAST STUDIO's services are exactly: **Website Development, Software
Development, Social Media Management, Bookkeeping, Virtual Assistant**. Only
ever recommend or pitch these when talking about RMAST.

### activity

```json
"activity": { "activityScore": 0-100, "signals": ["short dated evidence point", "..."] }
```

How sure you are the business is operating **today**. Make signals specific
and dated where possible: "TX TREC license #0123456 active, expires 2027",
"Instagram post 2026-10-02", "3 active Zillow listings". An old listing is not
evidence of current activity. Below 30 marks the lead inactive and skips the
rest; use that when you find clear closure evidence (expired license, nothing
in a year).

### analysis

```json
"analysis": {
  "scores": { "website": 0-100, "social": 0-100, "leadGeneration": 0-100,
              "conversion": 0-100, "seo": 0-100, "branding": 0-100 },
  "problems": ["specific problem", "x3"],
  "recommendations": ["specific fix using an RMAST service", "x3"]
}
```

Specific to this business and location, not generic.

### enrichment

```json
"enrichment": {
  "ownerName": "Full name", "ownerTitle": "Broker/Owner",
  "ownerLinkedin": "https://www.linkedin.com/in/...",
  "email": "owner's direct business email if public, else the business email",
  "phone": "owner's direct business line if public, else the office",
  "licenseInfo": "CA DRE #01234567, licensed (active)",
  "instagram": "https://www.instagram.com/...", "facebook": "https://www.facebook.com/...",
  "linkedin": "https://www.linkedin.com/company/..."
}
```

- Only professional contact details the person or business publishes (their
  site, license record, business profiles). Never personal details such as a
  home address, family members or personal social accounts unrelated to the
  business.
- `ownerLinkedin` must be the owner's own `/in/` profile; `linkedin` is the
  company page (or the realtor's profile if they have no company page).
- Profile URLs must be the real account for this exact person or business,
  never a search page or a guess. Empty string when not found.

### competitors

```json
"competitors": [{ "name": "Real business", "website": "https://...", "strength": "one specific advantage they have" }]
```

Up to 2 real, nearby businesses in the same niche, with evidence they exist.
No phone numbers, emails or other contact details.

### audit

```json
"audit": {
  "executiveSummary": "3-4 sentences: where the business stands and the biggest opportunity",
  "snapshot": { "whatTheyDo": "1 sentence", "targetCustomers": "1 sentence", "onlinePresence": "1 sentence" },
  "areas": [{ "area": "exact name from auditAreas", "score": 0-100,
              "status": "strong | needs work | critical",
              "findings": ["2-4 specific findings"], "recommendations": ["2-3 practical fixes"] }],
  "strengths": ["2-4 things they already do well"],
  "quickWins": ["3-5 changes doable within a week"],
  "actionPlan": [{ "phase": "First 30 days", "items": ["..."] },
                 { "phase": "Days 31-60", "items": ["..."] },
                 { "phase": "Days 61-90", "items": ["..."] }],
  "howWeHelp": [{ "service": "one of the five RMAST services", "outcome": "1 sentence tied to a finding" }]
}
```

Cover **all** of `auditAreas`, in order. A whole-business audit, not just the
website. Scores consistent with the analysis where they overlap. Report
missing data as a finding ("We couldn't find an Instagram profile for you").
Audit recommendations may cover anything that genuinely helps; `howWeHelp`
only the five services, and only where they address a finding.

### demo

A brief for a five-page site: Home, About, Services, a fourth page that fits
the niche (e.g. "Listings" for real estate, "Menu" for a restaurant,
"Projects" for a builder), and Contact. The app renders it with their real
logo and photos.

```json
"demo": {
  "demoDescription": "2-3 sentences for the internal dashboard",
  "siteName": "...", "tagline": "...", "style": "bold | elegant | warm | minimal",
  "colorPalette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
  "headingFont": "Google Font name", "bodyFont": "Google Font name",
  "home": { "heroHeadline": "under 10 words", "heroSubheadline": "1 sentence, concrete",
            "primaryCta": "button label", "introHeading": "...", "introCopy": "2-3 sentences",
            "highlights": [{ "title": "...", "text": "..." }] },
  "about": { "heading": "...", "intro": "1 sentence", "story": ["2-3 paragraphs"], "values": [{ "title": "...", "text": "..." }] },
  "services": { "heading": "...", "intro": "...", "items": [{ "name": "...", "description": "1-2 sentences" }] },
  "showcase": { "navLabel": "1-2 words", "heading": "...", "intro": "...",
                "items": [{ "title": "...", "text": "1-2 sentences", "tag": "short" }] },
  "testimonials": [{ "quote": "...", "name": "First name", "role": "context" }],
  "faq": [{ "question": "...", "answer": "..." }],
  "contact": { "heading": "...", "intro": "..." },
  "ctaHeadline": "...", "ctaText": "1 line"
}
```

- **Colors:** if `brand.colors` is non-empty, primary and accent MUST be taken
  from it, so the demo matches their existing branding. Otherwise pick a
  palette specific to the niche, never default blue/white/gray. Strong
  contrast between background and text.
- 3 highlights, each a visible fix for one of the analysis problems, written
  as a benefit to their customer. 3 values, 4-6 services they plausibly offer,
  3-6 showcase items, 3 short example testimonials (they are labeled as
  examples on the page), 4 FAQs a real customer would ask.
- Copy must be specific to this business: never "Welcome to", "Your trusted
  partner", "take your business to the next level", "in today's digital age",
  "state-of-the-art", "boost your online presence", "stand out from the
  competition", or lorem ipsum.

### outreach

```json
"outreach": { "email": "...", "whatsapp": "...", "instagram": "...", "facebook": "...", "linkedin": "..." }
```

One message per channel, from RMAST STUDIO:

- Address the owner by first name when you found it ("Hi Maria,").
- 2-4 sentences, friendly, low-pressure, suited to the channel (email may open
  with a greeting; WhatsApp and DMs are shorter and more casual).
- Reference at least one concrete finding about this business. Optionally one
  competitor's advantage as a light nudge, never a harsh callout.
- Mention in one short sentence that a personalized growth report and demo
  site are ready. **Never write a URL or placeholder link**: the app appends
  the real audit and demo links to each message automatically.
- No generic filler ("grow your business", "unlock your potential", etc.).
  Only RMAST's five services.
