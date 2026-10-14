/**
 * Cloudflare Worker: Blast Radio Status API
 *
 * Fetches a blastradio.com profile page and extracts broadcast state.
 * Returns JSON with status (live/archived/expired/none) and playable URL.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker → paste this.
 * Route: deeradio.uk/api/blast/*
 *
 * Usage: GET /api/blast?handle=deepspaceradio
 *        GET /api/blast?handle=deepspaceradio,getrocked,richpasternack
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    try {
      const handleParam = url.searchParams.get('handle');
      if (!handleParam) {
        return jsonResponse({ error: 'Missing ?handle= parameter' }, 400);
      }

      const handles = handleParam.split(',').map(h => h.trim()).filter(Boolean);
      if (handles.length === 0) {
        return jsonResponse({ error: 'No valid handles provided' }, 400);
      }

      if (handles.length > 20) {
        return jsonResponse({ error: 'Max 20 handles per request' }, 400);
      }

      const results = await Promise.all(handles.map(fetchBlastStatus));

      return jsonResponse(handles.length === 1 ? results[0] : results);
    } catch (err) {
      return jsonResponse({ error: 'Worker error: ' + err.message }, 500);
    }
  }
};

async function fetchBlastStatus(handle) {
  try {
    const resp = await fetch(`https://blastradio.com/${handle}`, {
      headers: { 'User-Agent': 'deeradio-status/1.0' },
    });

    if (resp.status === 404) {
      return { handle, state: 'not_found', error: 'User does not exist' };
    }

    if (!resp.ok) {
      return { handle, state: 'error', error: `HTTP ${resp.status}` };
    }

    const raw = await resp.text();

    // Unescape Next.js flight payload (quotes are backslash-escaped, & is \u0026)
    const text = raw.replaceAll('\\"', '"').replaceAll('\\u0026', '&');

    return parseBlastStatus(handle, text);
  } catch (err) {
    return { handle, state: 'error', error: err.message };
  }
}

/**
 * Parse broadcast state from an unescaped Next.js flight payload.
 *
 * Blast Radio moved finished broadcasts out of the `liveStream` object (now null
 * when nothing is live) into a `recentStreams` array whose entries share the same
 * field shape. We read both: a non-finished `liveStream` means the show is live;
 * otherwise the newest `recentStreams` entry determines archived/expired.
 */
function parseBlastStatus(handle, text) {
  const liveStream = extractJsonValue(text, '"liveStream":');
  const recentStreams = extractJsonValue(text, '"recentStreams":');

  // Live: a current liveStream object that hasn't finished.
  if (liveStream && typeof liveStream === 'object') {
    const end = liveStream.end == null ? null : liveStream.end;
    if (!liveStream.isFinished && end === null) {
      return {
        handle,
        state: 'live',
        url: liveStream.url,
        broadcastId: liveStream.id,
        start: liveStream.start,
        listeners: liveStream.numberOfListeners == null ? null : liveStream.numberOfListeners,
      };
    }
  }

  // Otherwise fall back to the most recent finished broadcast.
  const recent = Array.isArray(recentStreams) && recentStreams.length ? recentStreams[0] : null;
  if (recent) {
    const mp3Url = recent.mp3Url || null;
    const start = recent.start == null ? null : recent.start;
    const end = recent.end == null ? null : recent.end;

    if (recent.isFinished && mp3Url && mp3Url.startsWith('https://storage.googleapis.com')) {
      return {
        handle,
        state: 'archived',
        url: mp3Url,
        wavUrl: recent.wavUrl || null,
        broadcastId: recent.id,
        start,
        end,
      };
    }

    return {
      handle,
      state: 'expired',
      broadcastId: recent.id,
      start,
      end,
    };
  }

  // Nothing live and nothing recent.
  if (text.includes('"availableBroadcastsCount":0')) {
    return { handle, state: 'none', message: 'Never broadcast' };
  }
  return { handle, state: 'none', message: 'No broadcast data found' };
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
