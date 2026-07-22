# Changelog

All notable changes to DeeRadio are documented here.

## 2026-07-21

- Add Radio Ted to Blast
- Add blast-archive/ and .DS_Store to gitignore
- Sort blast shows by most recently ended within state groups

## 2026-07-20

- Add Trent Kelly on Blast
- Rename banner to Radio Online
- Update ABOUT.md with pages, AMP archive, visual design, versioning, and favicon docs

## 2026-07-14

- Add /amp show archive: shows by date, songs by popularity, artists by appearances

## 2026-07-12

- Add blast show: beyondthebar
- Add favicon and apple-touch-icon across all pages
- Visual redesign: pill nav, clickable cards, status badge removal, uniform card layout

## 2026-07-10

- Add Music by Year page (TickTock 1950-2026) with random play

## 2026-07-09

- Add Pure Classix Radio (MP3 + FLAC) to Other Stations
- Add Radio Random (AAC + FLAC) to Other Stations
- Add Radio Club 80 Ballads to Other Stations
- Add backlink to deeradio.uk from admin header
- Document admin dashboard, Cloudflare Access, and all three Workers
- Add Station Listeners section showing visitor GUIDs per station
- Add Visitors column to Top Stations table
- Switch admin Worker to REST API (fixes 500 from missing sql binding)
- Add admin-dashboard Worker (serves HTML + queries Analytics Engine)
- Add admin dashboard page (to be protected by Cloudflare Access)
- Add known visitors csv

## 2026-07-08

- Add 2 blast stations
- Include visitor ID in recent events query
- Document Workers and play tracking in ABOUT.md
- Fix country detection (use request.cf) and add localStorage visitor GUID
- Add play event tracking with Cloudflare Analytics Engine

## 2026-07-07

- Add 60-second polling for live show listener count
- Add 5yn7axradio

## 2026-07-06

- Add blast-architecture Mermaid diagram
- Add oldhead to Blast list

## 2026-07-05

- Fix handle of a Blast artist
- Add some known Blast stations
- Add Blast Radio status page with Cloudflare Worker

## 2026-07-04

- Add Exclusive Guest Picks page with curated bookmark sets
- Add custom domain (deeradio.uk) and infrastructure docs
- Create CNAME

## 2026-06-21

- Add Genre Presets page with broad categories, Last.fm tags, and hidden station sync
- Add Other Stations page and update nav across all pages
- Add direct.csv with Radio Paradise, Distorsion FM, and Radio Calico streams

## 2026-06-15

- Remove refresh-meta-btn event listener from bob page
- Disable metadata features on BOB page (CORS redirect blocks fetch)
- Add Radio BOB page with navigation between stream providers
- Compact header, larger dice, add favorite star to now-playing bar
- Switch to lighter theme with higher contrast for better Tesla readability
- Fix metadata reader: handle chunk boundary edge case so track updates continuously

## 2026-06-14

- Add Media Session API for Tesla/OS native now-playing widget
- Move stop button and track title to left side of now-playing bar
- Fix mixed content: change Aerosmith stream URL to HTTPS
- Add project roadmap and semantic versioning guidelines
- Redesign now-playing bar: station left, large track title right

## 2026-06-12

- Add refresh now-playing button on favorites section header
- Show only song title (trim artist) on favorite cards
- Refresh favorites metadata when a stream is played
- Show now-playing track info on favorite cards via metadata peek (max 10)

## 2026-06-11

- Add shareable URL with bitset-encoded favorites and hidden prefs
- Add future page to gather ideas
- Update CSV path to streams/ folder

## 2026-06-10

- Add random station button next to search bar
- Add hide station feature with restore button and localStorage
- Fix mobile now-playing: widen to 80% with marquee scroll for long titles
- Add ICY metadata parsing to show now-playing track info
- Remove 400/404 stations from CSV
- Make unfavorited star visible with outline style
- Add favorites with star toggle and localStorage persistence
- Fix CSV parsing for Windows line endings
- Add exclusive-radio.csv station data
- Add responsive radio station site with search and audio playback
- Initial commit
