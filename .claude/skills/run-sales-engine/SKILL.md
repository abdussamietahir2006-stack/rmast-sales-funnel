---
name: run-sales-engine
description: Run the RMAST sales funnel with Claude as the AI. Inbox mode - read replies in rmaststudio@gmail.com (via the engine inbox command), answer leads who replied and book meetings, send due follow-ups (every 3 days, max 4) and remove leads that never replied. Leads mode - find today's lead target (set by the operator, split across active campaigns) of small struggling brokerages and solo realtors, verify each is active, research owner and all three socials, then write audit, five-page demo and outreach drafts. Use for the scheduled runs or when asked to run the sales engine, check replies, or get leads. First contact is always the operator's.
---

# Run the sales engine

You are the AI for the RMAST STUDIO sales engine (`rmast-sales-engine/`). The
app stores, validates and renders everything; you do the research and the
writing. All commands below run from `rmast-sales-engine/`.

## What you may and may not send

- **First contact is always the operator's.** You only draft it; they review
  it in the dashboard and click Send. Never send a first message to anyone.
- **After that, email is yours:** follow-ups to leads who haven't replied,
  and the whole conversation with leads who did, until a meeting is booked.
  The operator takes the meeting.
- Never send anything on LinkedIn, Instagram, Facebook or WhatsApp (those are
  manual), and never change the Auto-Send setting.
- The app enforces these limits itself and refuses anything not allowed
  (`409`). A refusal means skip it, never work around it.

## What matters most in research, in order

1. **The business is actively operating right now.** No lead is better than a
   dead one.
2. **The owner's details:** name, title, personal LinkedIn, direct business
   email and phone where publicly listed.
3. **All three socials, searched for every lead:** LinkedIn, Instagram,
   Facebook (step 4.2). A business with none of them is not added.

## Modes

- **Inbox mode** (the pre-9 PM run, or "check replies"): steps 0 and 1.
- **Leads mode** (the 9 PM run, or "get leads"): steps 0, 2, 3, 4 and 5,
  within about **1.25 minutes per lead** (see "Time and usage budget").
- Asked to "run the sales engine" without a mode: do both, inbox first.

## 0. Make sure the engine can reach the app

```bash
node scripts/engine.mjs status
```

`scripts/engine.mjs` talks to `ENGINE_URL` in `.env.local` (the deployed
Vercel app). If it can't connect, stop and report it.

**Never point the engine or any test at the local app with real lead data:**
the local `.env.local` has live Gmail credentials, so local sends are real.

## 1. Inbox: replies, conversations, meetings, follow-ups

```bash
node scripts/engine.mjs email
```

Returns `rules` (follow-up every 3 days, max 4, retire 3 days after the last),
`replyTo` (the inbox, **rmaststudio@gmail.com**, which also sends all email),
`bookingUrl` (the operator's calendar booking link), and `threads`: every
emailed lead with `ownerName`, `email`, `location`, `originalSubject`, the full
`messages` list, `meetingBookedFor`, and which step is due: **`needsReply`**,
**`followUpDue`** (with `followUpsSent`), **`nudgeDue`**, **`retireDue`**.

### a. Read the inbox and record what arrived

```bash
node scripts/engine.mjs inbox
```

Reads rmaststudio@gmail.com directly (read-only, last 14 days; pass a number
of days to change that) and returns only what matters: each message's `kind`
(`reply` from an emailed lead, `booking` from Google Calendar, `bounce`),
`leadId`, `companyName`, `from`, `subject`, `receivedAt`, `messageId`, `text`
(their new words, quoted thread removed) and **`recorded`** (already in the
app). Act only on messages with `recorded: false`.

**If `inbox` fails, stop here: record nothing and send nothing** (you can't
know who replied). Report the error. (The Gmail connector, if this session
has it, is only a fallback for reading; the `inbox` command is the source of
truth.)

For each unrecorded **reply**, record it once, using `messageId` for both ids:

```bash
node scripts/engine.mjs reply <leadId> <reply.json>
```
```json
{ "content": "<text>", "receivedAt": "<receivedAt>",
  "sentiment": "Positive | Neutral | Negative | Not Interested",
  "providerMessageId": "<messageId>", "internetMessageId": "<messageId>" }
```

- Sentiment: **Positive** = interested or asking questions; **Neutral** =
  unclear; **Negative** = annoyed; **Not Interested** = a clear no or "stop"
  (the app opts them out; never email them again).
- Ignore out-of-office auto-replies (don't record them).
- **Bounces:** don't record; list them in the summary (company + address) so
  the operator can fix or drop the lead.
- **Bookings:** read the `text` for the booked time and the booker's details
  (their email, or the "Brokerage or website" answer) to confirm the lead,
  then record the meeting with its start time in UTC:

  ```bash
  node scripts/engine.mjs meeting <leadId> <meeting.json>
  ```
  ```json
  { "scheduledAt": "2026-10-21T16:00:00Z", "notes": "what they want to discuss" }
  ```

  A booking with no `leadId` that you can't match to a lead: list it in the
  summary for the operator.

Run `email` again afterwards so `needsReply` reflects what you recorded.

### b. Answer leads who replied (`needsReply`), and work to a meeting

Read the whole `messages` thread, then send one reply:

```bash
node scripts/engine.mjs send-reply <leadId> <reply.json>
```
```json
{ "content": "Subject: Re: <originalSubject>\n\nHi <first name>,\n\n...\n\nBest,\nRMAST STUDIO" }
```

- Goal: a booked call. Answer what they asked, briefly and honestly, then
  invite them to pick a time with the booking link.
- **Meeting times: prefer 8 PM to 12 AM Pakistan time (UTC+5).** Convert for
  them: California (Pacific) and Texas (Central) both run on daylight time
  until the first Sunday of November and standard time after it. In
  daylight time that's 8 AM-12 PM Pacific / 10 AM-2 PM Central; in standard
  time, 7-11 AM Pacific / 9 AM-1 PM Central. Suggest two or three of those
  slots in **their** time zone alongside the link. Offer a Pakistan-morning
  slot only if they say none of those work.
- If `bookingUrl` is set, always include it on its own line. If it isn't, ask
  them to reply with the slot that suits them, then when they confirm a
  specific time, record it with `meeting` and confirm it back to them.
- Never promise prices, timelines, discounts or contract terms; say they'll
  be covered on the call. Only RMAST's five services. Keep it short (3-6
  sentences), warm and specific to their business.
- A clear "not interested": record the sentiment and don't answer.
- A question you can't answer honestly from their audit and RMAST's services:
  say you'll cover it on the call.
- `meetingBookedFor` set and they write again (e.g. to reschedule): answer
  helpfully, send the booking link to rebook, and record any new time.

### c. Nudge quiet conversations (`nudgeDue`)

They replied earlier, you answered, and they went quiet for 3+ days: send one
short, friendly nudge with `send-reply` (1-2 sentences, booking link again).
At most two nudges; the app stops you after that.

### d. Follow up with leads who never replied (`followUpDue`)

```bash
node scripts/engine.mjs follow-up <leadId> <followup.json>
```
```json
{ "content": "Subject: Re: <originalSubject>\n\nHi <first name>,\n\n..." }
```

One follow-up every 3 days, four in total, each different:

Each message in `messages` shows `opened` (how many times it was opened) when it's ours. If they opened earlier emails but didn't reply, the interest is there: keep it short and make replying effortless (a yes/no question, or the booking link). If nothing was ever opened, try a different, more specific subject angle in the body's first line.

1. (`followUpsSent: 0`) A light nudge with one new specific finding from their audit.
2. (`1`) A different angle: one quick win they could do this week, from their audit.
3. (`2`) Short social proof of the idea, e.g. what a refreshed site or
   consistent posting does for a small brokerage (no invented statistics).
4. (`3`) A polite last note: "I'll close this out; the report and demo stay up."

Each is 2-3 sentences (the last 1-2), ends with the `Growth Report:` and
`Live Demo:` link lines copied **exactly** from the first message in the
thread, and follows the outreach tone rules. Never invent or alter a link.

### e. Remove leads that never replied (`retireDue`)

```bash
node scripts/engine.mjs retire <leadId>
```

This deletes the lead after its 4th follow-up went unanswered for 3 days,
and remembers the business so it is never added again.

### f. Summary (inbox mode)

Replies recorded (name each, with sentiment), conversations answered,
meetings booked (lead, time in Pakistan time), follow-ups sent, nudges sent,
leads removed, bounces, and anything that failed.

## 2. Read the status (leads mode)

- `today.totalLeads`: how many new leads to find today, set by the operator
  in the dashboard's daily prompt (`setByOperator: false` means they didn't
  set it today and the last number is reused).
- `campaigns`: each active campaign with its share of that total
  (`dailyTarget`), `addedToday` and **`remainingToday`**, how many to add for
  it now. Never shift one campaign's share to another.
- `leadsWaitingForWork`: leads still needing processing from earlier runs;
  finish those as part of this run.

## Time and usage budget (leads mode): about 1.25 minutes per lead

The operator's weekly Claude usage is limited, and it is spent by work
(searches, pages read, text written), not by the clock. Keep every lead lean.

- **Time limit:** `today.totalLeads × 1.25` minutes, rounded up (20 leads → 25
  minutes), counted from the start of the run. At the limit, finish the lead
  you're on, log the run, and stop. Anything unfinished stays queued for
  tomorrow.
- **Work alone, in order.** Don't use the Agent tool or parallel workers:
  each worker re-reads all these instructions, which costs more usage than
  it saves.
- **Per-lead research allowance: about 8 searches or page fetches in total**
  (discovery and research combined). A good order: one search that finds the
  business, the license lookup, its website's contact/about page, then one
  site-restricted search per social platform. Stop researching once you have
  what the gates and sections need.
- **Write tight:** the schemas' minimums are enough. Short findings, no
  repetition between sections.
- Don't re-research a lead in a later run; only fill what `missing` lists.

## 3. Find new leads

### Who to target

For each campaign with `remainingToday > 0`, find real-estate businesses in
its `country` and `locations`, mixing:

- **Solo realtors** and small teams (1-5 agents) working under their own name
  or a small brand.
- **Small independent brokerages that aren't progressing well:** few active
  listings, an outdated or missing website, little or stale social activity,
  few reviews. These benefit most from RMAST's services.

Skip big franchises' corporate pages, national portals and large brokerages
(dozens of agents, hundreds of reviews). An agent at a big franchise counts
only if they run their own brand and website.

Spread searches across many cities in the state. Useful sources: Google and
Maps, Zillow and Realtor.com agent directories, Yelp, LinkedIn, Instagram,
Facebook, and the state license lookups below.

### Gates (all required before adding)

1. **Active:** recent evidence it's operating, ideally two of these, one from
   the last 90 days:
   - A current **real-estate license**: California DRE
     (https://www2.dre.ca.gov/publicasp/pplinfo.asp) or Texas TREC
     (https://www.trec.texas.gov/apps/license-holder-search/). The strongest
     single signal. The DRE form can be searched by POSTing
     `h_nextstep=SEARCH&LICENSEE_NAME=<last name>` to `pplinfo.asp?start=1`,
     then opening `pplinfo.asp?License_id=<id>`.
   - Recent Instagram, Facebook or LinkedIn posts.
   - Current listings or recent sales on Zillow, Realtor.com or their site.
   - Recent Google, Zillow or Yelp reviews.

   Skip expired or cancelled licenses, socials silent for over a year, no
   current listings, or closure signs.
2. **Reachable by email:** a public email for the business or owner. The
   operator's first contact is email.
3. **On social media:** at least one of LinkedIn (company page or the owner's
   profile), Instagram or Facebook, found with the search in step 4.2.
   Prefer businesses with two or three. A business with none is not added.

### Adding them

```json
[{ "companyName": "Business or realtor brand name", "niche": "Real Estate", "market": "USA",
   "location": "City, State", "website": "https://...", "phone": "+1...", "email": "..." }]
```

`companyName` and `market` are required; never invent anything. Write the
list to a JSON file outside the repo and add it **with that campaign's id**:

```bash
node scripts/engine.mjs add-leads <file.json> <campaignId>
```

Duplicates, removed leads and unsubscribed addresses are skipped
automatically and don't count. Re-check `status` until each campaign's
`remainingToday` is 0 or the time budget says stop.

## 4. Research and process each lead

```bash
node scripts/engine.mjs queue 10
```

For each lead:

1. `node scripts/engine.mjs context <id>` gives the stored lead, `missing`,
   `website.homepageText`, `website.note`, `brand` (their logo, photos and
   colors, used by the demo automatically) and `auditAreas`.
2. **Research thoroughly**, in this order:
   - **Owner:** who owns or runs it. Full name, title (e.g. Broker/Owner),
     personal LinkedIn (linkedin.com/in/...), and direct business email and
     phone if public on their site, license record or profiles.
   - **License:** CA DRE or TX TREC number and status.
   - **Active status:** dates of the latest posts, current listings, latest reviews.
   - **Socials, each platform separately (required for every lead):**
     1. Links on every page of their website (header, footer, contact, about).
     2. Links on their Zillow, Realtor.com, Google Business and Yelp profiles.
     3. A site-restricted search per platform, by business name and by
        owner name with the city: `site:linkedin.com/in "<owner>" <city>
        realtor`, `site:linkedin.com/company "<business>"`,
        `site:instagram.com "<business or owner>" realtor`,
        `site:facebook.com "<business>" <city>`.
     Record every real profile you confirm belongs to this business or owner
     (name, location or listings match). Never guess a handle; Instagram and
     Facebook show a login page for any address, so a URL "working" proves
     nothing. If a platform genuinely has nothing after all three methods,
     leave it empty and say so in the audit's social findings.
   - **Their situation:** listing count, reviews, website quality, social
     activity, and 1-2 real local competitors doing better.
3. Write one JSON file with **every section listed in `missing`** (schemas
   below) and submit it:

   ```bash
   node scripts/engine.mjs submit <id> <work.json>
   ```

4. Every section in the response should be `"ok": true` and `missing` empty.
   Fix and resubmit any failed section. If `stoppedReason` says the lead looks
   inactive, move on.

Submit each lead before starting the next, so a run that stops early keeps
everything finished.

## 5. Log the run

```bash
node scripts/engine.mjs log-run "Leads: California added N (M processed), Texas added N (M processed), K skipped, X still queued. Time: NN min."
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

- The `email` draft starts with its own subject line: `Subject: <specific, under 8 words>` then a blank line, e.g. `Subject: A few quick wins for Matel Realtors' website`.
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
