# Blast Radio Broadcast State Detection

Technical reference for detecting the current broadcast state of a Blast Radio user by scraping their public profile page.

---

## Overview

Every Blast Radio user has a public page at `https://blastradio.com/{handle}`. The page embeds JSON data in a `<script>` tag containing all broadcast state information. No authentication is required.

A user's broadcast can be in one of three states:

| State | Meaning | Audio playable? |
|-------|---------|-----------------|
| **Live** | Currently broadcasting | Yes (live MP3 stream) |
| **Archived** | Most recent broadcast is finished but still available | Yes (signed GCS download) |
| **Expired / None** | No current or recent broadcast available | No |

---

## Page Structure

The data is embedded in a `<script>` tag (typically script index ~21 of ~30) containing a Next.js flight payload:

```
self.__next_f.push([1,"f:[[\"$\",\"$L18\",null,{...}]]"])
```

The JSON is double-escaped: literal quotes appear as `\\\"` and ampersands as `\\u0026`. You must unescape before parsing:

```
text = raw_html.replace('\\"', '"').replace('\\u0026', '&')
```

Two data blocks contain the relevant state:

1. **Status summary block** — high-level state flags
2. **liveStream object** — detailed broadcast data with URLs

---

## Detection Logic

### Step 1: Extract the Status Summary

Search for the JSON fragment:

```json
{"availableBroadcastsCount":N,"expiredBroadcastsCount":N,"isLive":BOOL,"totalBroadcastsCount":N,"broadcasterUsername":"...","broadcasterId":"..."}
```

Regex pattern:
```
"availableBroadcastsCount":(\d+),"expiredBroadcastsCount":(-?\d+|null),"isLive":(true|false),"totalBroadcastsCount":(\d+|null)
```

**State determination from this block alone:**

| `isLive` | `availableBroadcastsCount` | State |
|----------|---------------------------|-------|
| `true` | any | **Live** |
| `false` | `≥ 1` | **Archived** (playable) |
| `false` | `0` | **Possibly expired** (check liveStream) |
| not present | not present | **No broadcasts ever** |

Note: A user with no broadcasts at all will have a truncated status block with no `isLive` field:
```json
{"availableBroadcastsCount":0,"expiredBroadcastsCount":null,"totalBroadcastsCount":null}
```

### Step 2: Extract the liveStream Object

For detailed data (URLs, timestamps, listeners), locate the `"liveStream":{...}` object. This represents the most recent (or current) broadcast.

Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID string | Broadcast ID |
| `url` | string | Live stream endpoint: `https://broadcast.blastradio.com/{id}.mp3` |
| `mp3Url` | string or null | Signed GCS archive URL (MP3) |
| `wavUrl` | string or null | Signed GCS archive URL (WAV) |
| `flacUrl` | string or null | Signed GCS archive URL (FLAC) — rarely populated |
| `start` | integer | Unix timestamp, broadcast start |
| `end` | integer or null | Unix timestamp, broadcast end (`null` if still live) |
| `isFinished` | boolean | Whether broadcast has ended |
| `isPublished` | boolean | Whether broadcast is publicly visible |
| `numberOfListeners` | integer | Current active listeners |
| `totalListeners` | integer | Cumulative listeners |
| `source` | string | `"PLUGIN"`, `"BLAST_BOX"`, or `"APP"` |
| `mode` | string | `"BROADCAST"` |

### Step 3: Definitive State from liveStream

| `isFinished` | `end` | `mp3Url` | State |
|-------------|-------|----------|-------|
| `false` | `null` | null or live URL | **Live** — stream URL is playable |
| `true` | timestamp | GCS signed URL | **Archived** — download URL is playable |
| `true` | timestamp | `null` | **Expired** — no audio available |
| not present | — | — | **No broadcasts** |

**Important:** The `availableBroadcastsCount` field is not perfectly reliable for detecting archive availability. A user can show `availableBroadcastsCount: 0` while still having a working `mp3Url` in their liveStream object (observed up to 60+ hours after broadcast end). Always check the `mp3Url` field directly.

---

## Audio URLs

### Live Stream

```
https://broadcast.blastradio.com/{broadcast_id}.mp3
```

- Only works while the broadcast is active (`isFinished: false`)
- Icecast-style stream (chunked, indefinite length)
- Returns 400/404 after broadcast ends
- CORS headers present (`Access-Control-Allow-Origin: *`)

### Archived Audio (Signed GCS URLs)

```
https://storage.googleapis.com/blast-radio.appspot.com/uploads/blast-{broadcast_id}.mp3
  ?GoogleAccessId=firebase-adminsdk-rhn44%40blast-radio.iam.gserviceaccount.com
  &Expires=16447017600
  &Signature={base64_signature}
```

- Available only for the **most recent broadcast** per user
- Both MP3 and WAV formats when available
- Expiry timestamp is set to ~year 2491 (effectively permanent once generated)
- Standard HTTP download (Content-Type: `audio/mpeg`, supports Range requests)
- Only present when `mp3Url`/`wavUrl` in liveStream is not null
- Past broadcasts (in the broadcasts array) have `mp3Url: null`

---

## Broadcast History

Past broadcasts are in a JSON array following the liveStream object. Each entry:

```json
{
  "id": "3e4854d0-8c3c-4315-99bc-0fdeed1f9eb1",
  "userId": "ecf57ff1-0f7f-4e48-bd09-1d9138ddd763",
  "url": "https://broadcast.blastradio.com/{id}.mp3",
  "mp3Url": null,
  "wavUrl": null,
  "flacUrl": null,
  "start": 1783074667,
  "end": 1783078708,
  "userName": "getrocked",
  "isFinished": true,
  "isPublished": true,
  "source": "BLAST_BOX",
  "port": -1,
  "mode": "BROADCAST",
  "createdAt": 1783074667,
  "duration": 4041,
  "numberOfListeners": null,
  "totalListeners": 11
}
```

Regex pattern for extracting broadcast history:
```
"id":"([a-f0-9\-]{36})","userId":"[^"]+","url":"(https://broadcast\.blastradio\.com/[^"]+)",
"mp3Url":("null"|null|"[^"]*"),"wavUrl":("null"|null|"[^"]*"),"flacUrl":("null"|null|"[^"]*"),
"start":(\d+),"end":(\d+),"userName":"[^"]*","isFinished":(true|false),"isPublished":(true|false),
"source":"([^"]+)","port":[^,]+,"mode":"([^"]+)","createdAt":(\d+),"duration":(\d+),
"numberOfListeners":(\d+|null),"totalListeners":(\d+|null)
```

---

## Complete Detection Algorithm

```
1. GET https://blastradio.com/{handle}
2. Unescape: replace '\"' → '"', '\u0026' → '&'
3. Search for status block: "availableBroadcastsCount":...,"isLive":...
4. Search for liveStream object

IF no status block found OR no liveStream object:
  → State: NO_BROADCASTS (user exists but never streamed)

ELSE IF liveStream.isFinished == false AND liveStream.end == null:
  → State: LIVE
  → Playable URL: liveStream.url (live MP3 stream)

ELSE IF liveStream.mp3Url is not null AND liveStream.mp3Url starts with "https://storage.googleapis.com":
  → State: ARCHIVED
  → Playable URL: liveStream.mp3Url (direct download)
  → Also available: liveStream.wavUrl (if not null)

ELSE:
  → State: EXPIRED (broadcast ended, archive no longer available)
```

---

## Observed Timing

- Archives appear to be available for **at least 72 hours** after broadcast end (possibly longer — the exact expiry policy is not documented by Blast Radio)
- The `availableBroadcastsCount` field may flip to 0 before the signed URL actually stops working
- The signed GCS URLs themselves have an `Expires` parameter set far in the future — the archive disappears when Blast removes the file from storage, not when the signature expires

---

## Edge Cases

1. **User doesn't exist:** HTTP 404 from `blastradio.com/{handle}`
2. **User exists, never broadcast:** Status block is truncated (no `isLive`, no `broadcasterId`), no liveStream object
3. **Live but mp3Url populated:** During a live broadcast, `mp3Url` may point to `broadcast.blastradio.com` (the live stream URL, not a GCS archive). Only treat GCS URLs as archives.
4. **numberOfListeners is null:** Common for past broadcasts. Only the most recent/active broadcast has reliable listener counts.

---

## Request Requirements

- **Method:** GET
- **Authentication:** None required
- **Required headers:** None (works with default User-Agent)
- **Rate limiting:** No observed rate limits, but be reasonable
- **Response size:** 300-400KB typical (most of it is the embedded JavaScript/JSON)
