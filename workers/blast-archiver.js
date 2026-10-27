// Cloudflare Worker: Blast Radio Archive History
//
// Polls each known Blast Radio profile on a schedule and records every newly-seen
// archived broadcast's metadata into a Cloudflare D1 (SQLite) database, deduped by
// broadcast id. A companion static page (archive.html) reads the accumulated history
// and renders per-DJ listen/download/copy links.
//
// This is metadata-only (Tier 1). The mp3/wav links are ephemeral signed Google Cloud
// Storage URLs that Blast may expire; we refresh them on every poll but cannot
// guarantee they stay valid. The captured metadata/history is retained regardless.
//
// Deploy (manual, Cloudflare Dashboard):
//   1. Workers & Pages -> Create Worker -> paste this file (ES module format).
//   2. Create a D1 database and run workers/blast-archiver.schema.sql against it.
//   3. Bind the D1 database to this Worker with the binding name `DB`.
//   4. Add a Cron Trigger with the schedule `0 */12 * * *` (every 12 hours).
//   Route (read API): blast-archiver.YOUR_SUBDOMAIN.workers.dev
//
// D1 binding name: DB
// Cron schedule:   0 */12 * * *   (every 12 hours, at minute 0)
//
// Schema (workers/blast-archiver.schema.sql):
//   shows(
//     broadcast_id TEXT PRIMARY KEY,  -- Blast broadcast id (dedupe key)
//     handle       TEXT NOT NULL,     -- Blast profile handle
//     show_name    TEXT,              -- display name from SHOWS map
//     start_ts     INTEGER,           -- broadcast start (unix seconds)
//     end_ts       INTEGER,           -- broadcast end (unix seconds)
//     duration     INTEGER,           -- seconds (payload duration, else end - start)
//     listeners    INTEGER,           -- numberOfListeners if available
//     mp3_url      TEXT,              -- signed GCS mp3 (refreshed each poll)
//     wav_url      TEXT,              -- signed GCS wav (refreshed each poll)
//     first_seen   INTEGER,           -- unix seconds we first captured it (kept)
//     last_seen    INTEGER            -- unix seconds we last refreshed it
//   )
//
// Usage:
//   GET /            -> JSON array of all captured shows, newest start first.
//   scheduled (cron) -> poll all handles and upsert archived shows.

const SHOWS = [
  { handle: 'deepspaceradio', name: 'Deep Space Radio' },
  { handle: 'getrocked', name: 'Get Rocked' },
  { handle: 'richpasternack', name: 'Rich Pasternack' },
  { handle: 'lemmytellya73', name: 'Lemmy' },
  { handle: 'jaydeerothmeyer', name: 'jdr' },
  { handle: 'moshradio', name: 'MOSH' },
  { handle: 'uncledandy', name: 'Uncle Dandy' },
  { handle: 'intheboxnate', name: 'Nate' },
  { handle: 'trentkellyonthewaveshow', name: 'Trent Kelly' },
  { handle: 'beyondthebar', name: 'Beyond the Bar' },
  { handle: 'oldhead', name: 'Oldhead' },
  { handle: '5yn7axradio', name: 'Syntax' },
  { handle: 'radioted57', name: 'Radio Ted' },
  { handle: 'johntt', name: 'John TT' },
  { handle: 'lostmember', name: 'Losto' },
  { handle: 'thx138', name: 'Wolf Mark' },
];

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const { results } = await env.DB.prepare(
        'SELECT broadcast_id, handle, show_name, start_ts, end_ts, duration, ' +
        'listeners, mp3_url, wav_url, first_seen, last_seen ' +
        'FROM shows ORDER BY start_ts DESC'
      ).all();

      return jsonResponse(results || []);
    } catch (err) {
      return jsonResponse({ error: 'Worker error: ' + err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const now = Math.floor(Date.now() / 1000);

    // Poll every handle in parallel; wrap each task so one failure never aborts
    // the whole batch.
    await Promise.all(SHOWS.map(async (show) => {
      try {
        const record = await fetchArchivedShow(show);
        if (record) {
          await upsertShow(env, record, now);
        }
      } catch (err) {
        // Swallow per-handle errors; the next poll will try again.
        console.error(`archive poll failed for ${show.handle}:`, err && err.message);
      }
    }));
  },
};

/**
 * Fetch a Blast profile and return an archived-show record, or null if the most
 * recent broadcast is not an archived (finished + GCS-backed) show.
 */
async function fetchArchivedShow(show) {
  const resp = await fetch(`https://blastradio.com/${show.handle}`, {
    headers: { 'User-Agent': 'deeradio-archiver/1.0' },
  });

  if (!resp.ok) return null;

  const raw = await resp.text();
  // Unescape Next.js flight payload (quotes are backslash-escaped, & is \u0026)
  const text = raw.replaceAll('\\"', '"').replaceAll('\\u0026', '&');

  return parseArchivedShow(show, text);
}

/**
 * Parse the most-recent finished broadcast from an unescaped Next.js flight payload.
 *
 * Mirrors the parsing contract of blast-status.js: `liveStream` is null when nothing
 * is live, and finished broadcasts live in `recentStreams` (newest first). An archived
 * show is `isFinished === true` AND an `mp3Url` under storage.googleapis.com.
 *
 * NOTE: this is a self-contained duplicate of the helpers in blast-status.js /
 * blast-podcast.js so each file deploys as a standalone Cloudflare Worker.
 */
function parseArchivedShow(show, text) {
  const recentStreams = extractJsonValue(text, '"recentStreams":');
  const recent = Array.isArray(recentStreams) && recentStreams.length ? recentStreams[0] : null;
  if (!recent) return null;

  const mp3Url = recent.mp3Url || null;
  if (!recent.isFinished || !mp3Url || !mp3Url.startsWith('https://storage.googleapis.com')) {
    return null;
  }

  const start = recent.start == null ? null : recent.start;
  const end = recent.end == null ? null : recent.end;

  // Prefer the payload duration when it is a sane positive number; otherwise derive
  // it from end - start.
  let duration = null;
  if (typeof recent.duration === 'number' && isFinite(recent.duration) && recent.duration > 0) {
    duration = Math.round(recent.duration);
  } else if (start != null && end != null && end > start) {
    duration = end - start;
  }

  return {
    broadcast_id: String(recent.id),
    handle: show.handle,
    show_name: show.name,
    start_ts: start,
    end_ts: end,
    duration,
    listeners: recent.numberOfListeners == null ? null : recent.numberOfListeners,
    mp3_url: mp3Url,
    wav_url: recent.wavUrl || null,
  };
}

/**
 * Insert a captured show, or refresh its signed URLs / listeners / last_seen on
 * conflict. first_seen is set only on insert and preserved on conflict.
 */
async function upsertShow(env, r, now) {
  await env.DB.prepare(
    'INSERT INTO shows (broadcast_id, handle, show_name, start_ts, end_ts, duration, ' +
    'listeners, mp3_url, wav_url, first_seen, last_seen) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(broadcast_id) DO UPDATE SET ' +
    'mp3_url = excluded.mp3_url, ' +
    'wav_url = excluded.wav_url, ' +
    'listeners = excluded.listeners, ' +
    'last_seen = excluded.last_seen'
  ).bind(
    r.broadcast_id,
    r.handle,
    r.show_name,
    r.start_ts,
    r.end_ts,
    r.duration,
    r.listeners,
    r.mp3_url,
    r.wav_url,
    now,
    now
  ).run();
}

/**
 * Find the JSON value immediately following `key` in `text` and parse it.
 * Handles a null literal or a balanced {...} / [...] value (respecting strings
 * and escapes). Returns the parsed value, or null if absent/unparseable.
 */
function extractJsonValue(text, key) {
  const keyIdx = text.indexOf(key);
  if (keyIdx === -1) return null;

  let i = keyIdx + key.length;
  // Skip any whitespace between the colon and the value.
  while (i < text.length && (text[i] === ' ' || text[i] === '\n' || text[i] === '\t' || text[i] === '\r')) {
    i++;
  }

  if (text.startsWith('null', i)) return null;

  const openChar = text[i];
  if (openChar !== '{' && openChar !== '[') return null;
  const closeChar = openChar === '{' ? '}' : ']';

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === openChar) {
      depth++;
    } else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(i, j + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
