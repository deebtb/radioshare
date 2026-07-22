# Infrastructure Overview

Internal reference for how deeradio.uk is wired up.

---

## Architecture at a Glance

```
User request
    │
    ▼
┌──────────────────────┐
│  Cloudflare (proxy)  │  ← DNS, TLS termination, caching, analytics, WAF
│  deeradio.uk         │
└──────────┬───────────┘
           │  HTTPS (Full mode)
           ▼
┌──────────────────────┐
│  GitHub Pages        │  ← Static hosting, builds from main branch
│  deebtb.github.io │
└──────────────────────┘
```

---

## Source & Hosting

- **Repository:** `deebtb/radioshare` on GitHub (private/public).
- **Hosting:** GitHub Pages, deployed automatically from the `main` branch.
- **Build:** None. The site is static HTML/CSS/JS served directly from the repo root. No build step, no bundler, no CI pipeline.
- **Deploy trigger:** Any push to `main` triggers a GitHub Pages deployment (typically live within 1–2 minutes).

---

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production  | `https://deeradio.uk` | Public-facing site via Cloudflare |
| Admin       | `https://admin.deeradio.uk` | Authenticated analytics dashboard (Cloudflare Worker + Access) |
| Staging     | `https://deebtb.github.io/radioshare` | Pre-production testing via GitHub Pages directly |

Production and Staging serve the same content from the same branch. The staging URL bypasses Cloudflare entirely. Admin is a separate Worker-served app behind authentication.

---

## DNS Configuration (Cloudflare)

Domain `deeradio.uk` is registered and managed on Cloudflare.

| Type  | Name  | Target / Value       | Proxy Status |
|-------|-------|----------------------|--------------|
| A     | @     | 185.199.108.153      | Proxied (orange) |
| A     | @     | 185.199.109.153      | Proxied (orange) |
| A     | @     | 185.199.110.153      | Proxied (orange) |
| A     | @     | 185.199.111.153      | Proxied (orange) |
| CNAME | www   | deebtb.github.io  | Proxied (orange) |
| CNAME | admin | admin-dashboard.deebeyondthebar.workers.dev | Proxied (orange) |

The four `A` records are GitHub Pages' IP addresses. The `CNAME` for `www` aliases to the GitHub Pages subdomain.

---

## TLS / SSL

- **Cloudflare SSL/TLS mode:** Full
  - Cloudflare terminates TLS from the browser, then connects to GitHub Pages over HTTPS.
  - "Full" (not "Full Strict") because GitHub Pages uses a shared Let's Encrypt cert that Cloudflare doesn't pin against.
- **GitHub Pages:** Enforces HTTPS. Certificate provisioned automatically by GitHub (Let's Encrypt) for the custom domain.

---

## Cloudflare Proxy (Orange Cloud)

With proxy enabled, all traffic to `deeradio.uk` flows through Cloudflare's edge network. This provides:

- **Analytics** — request volume, unique visitors, bandwidth, geographic breakdown.
- **Caching** — static assets cached at edge nodes; reduces load on GitHub Pages.
- **Security** — DDoS mitigation, bot detection, WAF rules, rate limiting.
- **Performance** — Brotli compression, HTTP/2, early hints.

---

## CNAME File

The file `CNAME` in the repo root contains:

```
deeradio.uk
```

This tells GitHub Pages to respond to requests for `deeradio.uk`. Without it, GitHub Pages would only serve on `deebtb.github.io`. This file must remain in the repo; deleting it breaks the custom domain binding.

---

## Maintenance Notes

- **To disable Cloudflare proxy temporarily:** Toggle records to DNS-only (grey cloud). Traffic goes direct to GitHub Pages. Analytics and caching stop.
- **To change domain:** Update the `CNAME` file in the repo, update GitHub Pages settings, and reconfigure Cloudflare DNS.
- **To add a subdomain (e.g., api.deeradio.uk):** Add a DNS record in Cloudflare pointing to whatever service backs it. Does not affect the GitHub Pages setup.
- **SSL errors / redirect loops:** Almost always caused by the SSL/TLS mode being set to "Flexible" instead of "Full". Check Cloudflare → SSL/TLS → Overview.
- **GitHub Pages 404 on custom domain:** Verify the `CNAME` file exists in the deployed branch and that the custom domain is confirmed in repo Settings → Pages.

---

## Cloudflare Workers

Three Workers are deployed under the `deebeyondthebar` subdomain on workers.dev:

### blast-status

- **URL:** `https://blast-status.deebeyondthebar.workers.dev`
- **Purpose:** Proxy/parser for Blast Radio show status. Fetches blastradio.com profile pages (which block browser CORS), parses embedded JSON to extract broadcast state, and returns clean JSON.
- **Source:** `workers/blast-status.js`
- **Bindings:** None
- **Called by:** `blast.html` on page load and via 60-second polling while a show is live.

### play-tracker

- **URL:** `https://play-tracker.deebeyondthebar.workers.dev`
- **Purpose:** Receives play/stop events from all pages and writes them to Cloudflare Analytics Engine.
- **Source:** `workers/play-tracker.js`
- **Bindings:** Analytics Engine dataset `plays` (variable name: `PLAYS`)
- **Called by:** `tracker.js` (included on all pages) via `navigator.sendBeacon()`.

### admin-dashboard

- **URL:** `https://admin.deeradio.uk`
- **Purpose:** Serves the admin dashboard and queries Analytics Engine via REST API. Combines the HTML frontend and analytics API in a single Worker.
- **Source:** `workers/admin-dashboard.js`
- **Secrets:** `CF_ACCOUNT_ID`, `CF_API_TOKEN` (stored as encrypted secrets in Worker settings)
- **Bindings:** None (uses REST API to query Analytics Engine)
- **Protected by:** Cloudflare Access (Zero Trust). Only authenticated emails can access.
- **Routes:**
  - `GET /` → Dashboard HTML
  - `GET /api/stats` → JSON analytics data (top stations, recent activity, overview, country breakdown, station listeners)

### Cloudflare Access (Zero Trust)

The `admin.deeradio.uk` subdomain is protected by Cloudflare Access (free tier, up to 50 users).

- **Authentication method:** One-time PIN (email code)
- **Policy:** Allow specific email address(es) only
- **Configuration:** Zero Trust dashboard → Access → Applications
- **Session duration:** 24 hours (configurable)

Visitors to `admin.deeradio.uk` see a Cloudflare login gate. After entering an approved email, they receive a one-time code. Once authenticated, the session persists for the configured duration.

### Updating Workers

Workers are deployed via the Cloudflare dashboard (copy-paste). There is no Wrangler CLI or CI/CD set up. To update:

1. Edit the source file in `workers/`
2. Cloudflare dashboard → Workers & Pages → select the Worker → Edit Code
3. Paste the new code → Save and Deploy

---

## Play Event Tracking

Custom analytics tracking what stations are being listened to, implemented entirely within Cloudflare (no third-party scripts).

### How It Works

```
User clicks Play
    │
    ▼
tracker.js (included on all pages)
    │  navigator.sendBeacon() — fire-and-forget POST
    │  Payload: {station, page, action, visitor}
    ▼
┌─────────────────────────────────┐
│  play-tracker Worker            │
│  • Reads request.cf.country     │
│  • Writes to Analytics Engine   │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Analytics Engine (dataset:     │
│  "plays")                       │
│  • 3-month retention            │
│  • Queryable via SQL API        │
└─────────────────────────────────┘
```

### Data Schema (per event)

| Field | Analytics Engine Slot | Content |
|-------|----------------------|---------|
| Station name | blob1 | e.g., "Exclusively Beatles" |
| Page | blob2 | e.g., "exclusive-radio", "radio-bob", "blast", "guest-picks", "other", "presets" |
| Action | blob3 | "play" or "stop" |
| Country | blob4 | ISO country code from `request.cf.country` |
| Visitor ID | blob5 | UUID from client localStorage |
| Count | double1 | Always 1 (for aggregation) |
| Index | indexes[0] | Station name (for efficient queries) |

### Visitor Identification

- A UUID is generated on first visit via `crypto.randomUUID()` and stored in `localStorage` as `deeradio_visitor`.
- The same ID persists across sessions on the same browser/device.
- No cookies, no PII, no third-party tracking. The ID is meaningless outside the context of this analytics.
- Clearing localStorage resets the ID (new "visitor" from analytics perspective).

### tracker.js

Included via `<script src="tracker.js"></script>` on every page before the main script. Exposes two functions:

```javascript
trackPlay(stationName, pageName)  // Called when playback starts
trackStop(stationName, pageName)  // Available for stop events
```

### Querying Analytics

Use the Python script `scripts/analytics.py`:

```bash
python scripts/analytics.py              # All reports
python scripts/analytics.py today        # Today's plays
python scripts/analytics.py top_stations # Top stations (7 days)
python scripts/analytics.py by_country   # Plays by country
python scripts/analytics.py unique_listeners  # Unique visitors per page
python scripts/analytics.py recent       # Last 20 events (raw)
```

Requires `.env` file (gitignored) with:

```
CF_ACCOUNT_ID=<your_account_id>
CF_API_TOKEN=<your_api_token>
```

The API token needs "Analytics Read" permission. Create it at: My Profile → API Tokens → Create Token.

### Raw SQL Queries

You can also query directly via curl:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d "SELECT blob1 as station, count() as plays FROM plays WHERE timestamp > now() - interval '7' day GROUP BY station ORDER BY plays DESC LIMIT 20"
```

### Data Retention

Analytics Engine retains data for **3 months**. No archival or export is configured.

### Adding Tracking to a New Page

1. Include `<script src="tracker.js"></script>` before the main `<script>` tag.
2. Call `trackPlay(station.name, 'your-page-id')` inside the `playStation()` function after `currentStation` is set.
3. Optionally call `trackStop()` on stop if you want stop events tracked.

---

## Site Pages

| Page | File | Description |
|------|------|-------------|
| Exclusive Radio | `index.html` | Main page. ~360 Exclusive Radio streams with favorites, hide, search, share URL |
| Exclusive Guest Picks | `guestpicks.html` | Curated bookmark sets from `streams/guestlists.csv`. Bookmarked stations on top. |
| Radio BOB | `bob.html` | Radio BOB streams from `streams/bob.csv` |
| Other Stations | `other.html` | Hand-picked stations from `streams/direct.csv` (Radio Paradise, Distorsion FM, Radio Calico, Pure Classix, Radio Random, Radio Club 80 Ballads, etc.) |
| Genre Presets | `presets.html` | Exclusive Radio stations filterable by genre/category |
| Blast Radio | `blast.html` | Live status of blastradio.com shows via Worker proxy. Polls every 60s when a show is live. |
| Music by Year | `years.html` | TickTock 1950–2026 year grid. Streams from `streaming.positivity.radio/tt/{year}/icecast.audio` |
| AMP Archive | `amp/index.html` | Hidden (unlisted) show history from Amazon AMP broadcasts (142 shows, Apr 2022–Mar 2023) |

---

## AMP Show Archive (`/amp/`)

A personal archive of 142 radio shows broadcast on Amazon AMP. Not linked from the main site — discoverable only by direct URL.

- **Data source:** `amp/amp-playlists.csv` (1,948 rows, 1,411 unique songs, 462 artists)
- **Pages:**
  - `amp/index.html` — Landing page with stats and navigation
  - `amp/shows.html` — Shows by date, filterable, clickable cards
  - `amp/show.html?title=X&date=Y` — Individual show tracklist with prev/next navigation
  - `amp/songs.html` — Songs ranked by play frequency
  - `amp/artists.html` — Artists ranked by appearances, expandable to show their songs
- **No playback links** — reference only (licensing considerations)
- **No analytics tracking** — `tracker.js` not included on /amp pages

---

## Visual Design (v1.1.0)

Key design decisions made in the v1.1.0 redesign:

- **Navigation:** Pill-shaped buttons (`border-radius: 20px`) with active state (solid blue) and inactive state (light blue with border). Wraps on mobile via `flex-wrap`.
- **Cards as tap targets:** Entire station card is clickable to play. No explicit play button. Fav (☆/★) and hide (🚫) buttons are positioned vertically centered on the right side with `stopPropagation()`.
- **Playing state:** Card background turns light green (`#f0fff4`) with green border (`#276749`) — no badge or button needed.
- **Uniform card height:** `min-height: 70px`, `justify-content: center`, compact padding.
- **Station names:** `font-weight: 700`, `font-size: 1.05rem`
- **Track/name text:** `padding-right: 3.5rem` to avoid overlapping fav/hide buttons.

---

## Versioning

Tags follow [SemVer](VERSIONING.md):

| Tag | Description |
|-----|-------------|
| `v1.0.0` | Original working site before visual/interaction redesign |
| `v1.1.0` | Visual redesign: pill nav, clickable cards, uniform layout, favicon |

---

## Favicon

Standard favicon set generated from favicon.io, included on all pages:

- `favicon.ico` — browser tab (legacy)
- `favicon-16x16.png` / `favicon-32x32.png` — modern browsers
- `apple-touch-icon.png` — iOS home screen
- `android-chrome-192x192.png` / `android-chrome-512x512.png` — Android/PWA
- `site.webmanifest` — PWA manifest

All pages include:
```html
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="manifest" href="/site.webmanifest">
```
