# RMAST Sales Engine

A single-operator growth pipeline: discover local businesses, audit their online
presence, build each one a personalized demo, draft outreach, send it, and record
the replies.

Next.js 16 (App Router) · React 19 · MongoDB (no ORM) · Gemini.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and sign in at `/login` with `AUTH_EMAIL` /
`AUTH_PASSWORD`.

## Environment variables

Only the first four are required; every integration degrades to a clear "not
configured" response without its key.

| Variable | Required | What it does |
| --- | --- | --- |
| `MONGODB_URI` | yes | Connection string. The app uses the `rmast` database. |
| `AUTH_EMAIL` | yes | The operator's login email. |
| `AUTH_PASSWORD` | yes | Seeds the stored password on first login (see below). |
| `AUTH_SECRET` | yes | Signing key for session cookies and public link tokens. Use a long random string. |
| `CRON_SECRET` | for cron | Bearer token the scheduled run must present. |
| `NEXT_PUBLIC_APP_URL` | for links | Public base URL, used in audit links and unsubscribe links. |
| `AI_API_KEY` | for AI | Gemini API key. Without it, analysis/audit/demo/outreach return 501. |
| `AI_MODEL` | no | Gemini model id. Defaults to `gemini-3.5-flash`. |
| `AI_TIMEOUT_MS` | no | Per-request timeout. Defaults to 90000. |
| `OPENROUTER_API_KEY` | no | 1st fallback for plain generation calls once Gemini's free tier is exhausted. See below. |
| `OPENROUTER_MODEL` | no | Which free OpenRouter model to fall back to. Defaults to `nvidia/nemotron-3.5-lightning:free`. |
| `GROQ_API_KEY` | no | 2nd fallback — genuinely free (not trial-credit), fast, OpenAI-compatible. |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile`. |
| `CEREBRAS_API_KEY` | no | 3rd fallback — OpenAI-compatible, but a one-time $5 trial credit, not persistent. |
| `CEREBRAS_MODEL` | no | Defaults to `gpt-oss-120b`. |
| `COHERE_API_KEY` | no | 4th (last-resort) fallback — persistent free key, capped at 1,000 calls/**month**. |
| `COHERE_MODEL` | no | Defaults to `command-a-plus-05-2026`. |
| `GOOGLE_PLACES_API_KEY` | for discovery | Places API (New) key for lead discovery. |
| `EMAIL_API_KEY` | for email | Resend API key. |
| `EMAIL_FROM` | for email | Verified sender address. |
| `EMAIL_WEBHOOK_SECRET` | for replies | Resend webhook signing secret (`whsec_…`). |
| `WHATSAPP_ACCESS_TOKEN` | for WhatsApp | Meta Cloud API token. |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | Sending phone number id. |
| `WHATSAPP_APP_SECRET` | for replies | Meta app secret, verifies webhook signatures. |
| `WHATSAPP_VERIFY_TOKEN` | for replies | Your chosen token for Meta's webhook handshake. |
| `WHATSAPP_API_VERSION` | no | Graph API version. Defaults to `v21.0`. |
| `ENRICHMENT_API_KEY` | no | Reserved for a Hunter.io / Apollo.io lookup. |

### About the password

`AUTH_PASSWORD` seeds the credential the first time someone logs in; after that
the password lives as a salted PBKDF2 hash in MongoDB. Changing it from
**Settings** works in production and signs out every session, including yours.
The env var is only the bootstrap value.

## Access model

`proxy.ts` gates `/dashboard/*` and `/api/*`. Everything requires an operator
session except:

- `/api/auth/login`, `/api/auth/logout`, `/api/health`
- `/api/audit/*` and `/api/demo/*` — the prospect-facing report and demo
- `/api/public/*` — booking from the audit page, and unsubscribe
- `/api/cron/*` — authenticated with `CRON_SECRET`
- `/api/webhooks/*` — authenticated by provider signature

## Sending

One switch controls this — **Settings → "Auto-Send Outreach."**

- **Off** (the default): the cron runs the whole pipeline — discovers, analyzes,
  audits, drafts demos and outreach — and stops there. Nothing is ever sent on
  its own; you send each message by hand from the lead's own page (the Send
  button next to each channel), which is itself the review step.
- **On**: the cron sends every eligible lead's email and WhatsApp outreach the
  moment it's drafted, unattended, with nobody reviewing it first. There is no
  separate per-lead approval anymore — this one switch is the whole gate.

Turn it on only once you trust the drafts unsupervised and, if you're sending
email, only after your sending domain is warmed up (see below) — flipping it
on for a cold domain is how a domain gets blacklisted before it's sent a
single real pitch.

Every email carries a one-click unsubscribe link and `List-Unsubscribe` headers.
Unsubscribes, hard bounces, spam complaints and "not interested" replies all add
the address to a suppression list that blocks further sends regardless of this
setting.

Cold outreach is regulated — GDPR and PECR in the EU and UK, CASL in Canada,
CAN-SPAM in the US. This setting is a floor, not legal advice.

## The scheduled run

`vercel.json` schedules `GET /api/cron/run-engine` once daily, at midnight UTC
— **Vercel Hobby only allows cron to run once a day**; a more frequent
schedule fails to deploy outright. Each run:

1. **Discovers leads for every Active campaign** — no AI involved, just Places
   API calls and inserts. A campaign's `leadCountPerRun` (up to 500) is
   genuinely how many new leads can land per day, split across its
   configured locations — a single location/niche search realistically tops
   out around 60 results (Google's own Text Search pagination limit), so
   reaching a few hundred means spanning enough locations, not one.
2. **Fully processes up to `BATCH_SIZE` (25) of the resulting `New` leads** —
   verify activity → analyze → enrich → competitors → audit → demo →
   outreach, calling the pipeline functions in `lib/pipeline.ts` directly. A
   lead the activity check confidently flags `inactive` is skipped here —
   logged, left as `New`, never silently deleted — the rest still run
   normally.
3. Sends only where the Auto-Send setting allows it.

**These two numbers are not the same, and can't be made the same.** Discovery
is cheap (HTTP + a DB write) and scales to hundreds a day. Full processing is
11-17 Gemini calls per lead, sequential, at roughly 40-70+ seconds each — so a
single 300-second run realistically completes something like 5-10 of them, no
matter how high `BATCH_SIZE` is set; the loop stops itself about 45 seconds
before `maxDuration` and leaves the rest as `New` for tomorrow's run. Fully
processing 200 leads in one invocation isn't a Hobby-plan restriction to
upgrade past — even Pro's extended 30-minute function ceiling isn't close to
enough for that math.

If you want more than ~5-10 fully processed per day without changing any of
the above, the lever is running this endpoint more than once daily via an
external scheduler (e.g. a GitHub Actions workflow on a cron trigger, hitting
this URL with the `CRON_SECRET` bearer token) instead of relying solely on
Vercel's own once-a-day Cron Jobs — nothing about the route itself restricts
how often it can be called, only Vercel's Cron Jobs product does on Hobby.

### Activity verification

A Google Places listing has no reason to correct itself once nobody's looking
at it — a business that closed years ago can still show up as "operational"
today. `verifyLeadActivity()` in `lib/pipeline.ts` catches this before any
other pipeline effort is spent on the lead:

1. **Free, certain check first**: if Places already marked the listing
   `CLOSED_PERMANENTLY` or `CLOSED_TEMPORARILY` (which can happen for a lead
   imported some other way, since discovery itself only keeps `OPERATIONAL`
   ones), it's flagged inactive instantly — no AI call.
2. Otherwise: a direct reachability check on the lead's own website (catches
   parked/expired-domain pages), plus one Gemini grounded-search call asking
   for recent evidence the business is still trading — not just that a
   listing exists.
3. The result is a 0–100 `activityScore`, a few `activitySignals`, and a
   derived `activityVerdict` (`active` / `review` / `inactive`) — visible on
   the lead's own page and as a badge in the Leads Directory.

**Deliberately fails open**: a quota error or an inconclusive search never
marks a lead inactive — only a confident verdict does, and even then the lead
is just skipped by the *scheduled* run. A manual "Verify Activity" click,
the Copilot's `verify_activity` tool, or any other button on the lead's page
still works regardless — nothing is ever deleted, and the operator can always
override an automated call that looks wrong.

Like the competitor and social-profile lookups, this uses a grounded search
call — the tighter, separately-limited Gemini quota — so it does add one more
of those per lead. The trade is deliberate: one grounded call up front can
save the ~10+ plain calls (and a wasted audit/demo/outreach cycle) that would
otherwise be spent processing a lead that's actually dead.

Two things to check against your Vercel plan: cron frequency (Hobby allows one
run per day, so the twice-daily schedule needs Pro) and function duration.

## Webhooks

Point the providers at:

- Resend → `POST https://<your-domain>/api/webhooks/email`
- WhatsApp Cloud API → `https://<your-domain>/api/webhooks/whatsapp`
  (the same URL serves Meta's `GET` verification handshake)

Until these are configured, the Reply Sentiment and Best Time to Contact pages
have nothing to show — replies are the only thing that feeds them.

## Gemini usage

A full pipeline run costs roughly 11–17 Gemini calls per lead, one of which is a
grounded search (the expensive kind). `lib/ai.ts` caps concurrency at 2, paces
requests, truncates oversized prompts, and retries 429s and 5xxs with backoff,
honouring `Retry-After`.

### When Gemini's free tier runs out

The free tier caps out at a few hundred requests a day and 250K tokens/minute
— tight enough that a normal cron batch can hit it. Two ways to fix it:

- **Enable billing on the Gemini API key** (recommended for real production
  volume). Flash-tier pricing is cheap at this volume and removes the caps
  entirely — no code changes.
- **Configure the fallback chain** in `lib/ai.ts`. Once Gemini's own retries
  in `requestGemini()` are exhausted, `callGemini()` (and therefore
  `callGeminiJson()`) walks a chain of other providers in order —
  **OpenRouter → Groq → Cerebras → Cohere → OpenAI** — until one answers.
  Configure as many of `OPENROUTER_API_KEY`, `GROQ_API_KEY`,
  `CEREBRAS_API_KEY`, `COHERE_API_KEY`, `OPENAI_API_KEY` as you want; each one
  just adds more headroom before a call can actually fail. If every
  configured provider fails, the *original Gemini error* is what surfaces —
  so existing error messages (quota warnings, etc.) stay accurate regardless
  of how many fallbacks were tried first.

  Every provider in the chain is that provider's own official, documented
  service — never a scraped or unofficial "unlimited key" source. Those
  exist and get recommended a lot, but routing real prospect and business
  data through an unaccountable third-party proxy is a genuine data-exposure
  risk, and such keys are liable to vanish without warning mid-pipeline —
  the opposite of what a reliability fallback is for.

  The first four are free tiers; the fifth is not. **Cerebras** is a
  one-time $5 trial credit, not a persistent free tier — it'll eventually
  stop working once spent. **Cohere**'s free key is capped at 1,000 calls a
  **month** (not a day), so it's placed after the daily-renewing ones and
  should be thought of as an occasional last resort, not steady-state
  capacity. Groq and OpenRouter are the two genuinely-renewing daily
  allowances — buying $10 of OpenRouter credit *once* (not monthly)
  permanently raises its free tier from 50 to 1,000 requests/day. **OpenAI**
  is placed last and is the odd one out: it has no free tier at all and is
  billed per token from the very first call, so it only gets reached once
  every free option above has failed — it defaults to the cheapest current
  model (`gpt-5.4-nano`) rather than a flagship one, since it's a safety net,
  not steady-state capacity either.

This fallback chain deliberately does **not** cover `callGeminiWithSearch()`
— grounded search (used for competitor discovery and social-profile lookup)
has no equivalent on any of these generic chat models, and guessing without a
real search would reintroduce fabricated data exactly where
[lib/pipeline.ts](lib/pipeline.ts) already goes out of its way to prevent it.
When search quota is exhausted, those steps still just skip gracefully with a
warning, as before — no fallback provider count changes that.

Free-model catalogs and even whole programs change without notice (GitHub
Models, for instance, was retired outright in mid-2026) — if a default model
id above stops working, check that provider's current docs for a
replacement and override it via the matching `*_MODEL` env var.

## Layout

```
app/api/          route handlers (thin wrappers over lib/)
app/dashboard/    operator UI
app/audit/[slug]  public growth report
app/demo/[id]     public generated demo, rendered in a sandboxed iframe
lib/ai.ts         Gemini client: retry, backoff, pacing, timeouts
lib/pipeline.ts   the eight-stage pipeline as plain functions
lib/send.ts       outbound email/WhatsApp, suppression list
lib/inbound.ts    inbound replies and sentiment classification
lib/places.ts     Google Places discovery
lib/session.ts    HMAC-signed session tokens
lib/auth.ts       password hashing and versioning
lib/safe-fetch.ts SSRF-guarded outbound fetch for lead websites
models/           TypeScript shapes for the collections
```
