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
│  dscharton.github.io │
└──────────────────────┘
```

---

## Source & Hosting

- **Repository:** `dscharton/radioshare` on GitHub (private/public).
- **Hosting:** GitHub Pages, deployed automatically from the `main` branch.
- **Build:** None. The site is static HTML/CSS/JS served directly from the repo root. No build step, no bundler, no CI pipeline.
- **Deploy trigger:** Any push to `main` triggers a GitHub Pages deployment (typically live within 1–2 minutes).

---

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production  | `https://deeradio.uk` | Public-facing site via Cloudflare |
| Staging     | `https://dscharton.github.io/radioshare` | Pre-production testing via GitHub Pages directly |

Both environments serve the same content from the same branch. The staging URL bypasses Cloudflare entirely.

---

## DNS Configuration (Cloudflare)

Domain `deeradio.uk` is registered and managed on Cloudflare.

| Type  | Name  | Target / Value       | Proxy Status |
|-------|-------|----------------------|--------------|
| A     | @     | 185.199.108.153      | Proxied (orange) |
| A     | @     | 185.199.109.153      | Proxied (orange) |
| A     | @     | 185.199.110.153      | Proxied (orange) |
| A     | @     | 185.199.111.153      | Proxied (orange) |
| CNAME | www   | dscharton.github.io  | Proxied (orange) |

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

This tells GitHub Pages to respond to requests for `deeradio.uk`. Without it, GitHub Pages would only serve on `dscharton.github.io`. This file must remain in the repo; deleting it breaks the custom domain binding.

---

## Maintenance Notes

- **To disable Cloudflare proxy temporarily:** Toggle records to DNS-only (grey cloud). Traffic goes direct to GitHub Pages. Analytics and caching stop.
- **To change domain:** Update the `CNAME` file in the repo, update GitHub Pages settings, and reconfigure Cloudflare DNS.
- **To add a subdomain (e.g., api.deeradio.uk):** Add a DNS record in Cloudflare pointing to whatever service backs it. Does not affect the GitHub Pages setup.
- **SSL errors / redirect loops:** Almost always caused by the SSL/TLS mode being set to "Flexible" instead of "Full". Check Cloudflare → SSL/TLS → Overview.
- **GitHub Pages 404 on custom domain:** Verify the `CNAME` file exists in the deployed branch and that the custom domain is confirmed in repo Settings → Pages.
