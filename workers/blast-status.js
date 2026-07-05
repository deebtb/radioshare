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

    // Unescape Next.js flight payload
    const text = raw.replaceAll('\\"', '"').replaceAll('\\u0026', '&');

    // Extract status summary
    const statusMatch = text.match(
      /"availableBroadcastsCount":(\d+),"expiredBroadcastsCount":(-?\d+|null),"isLive":(true|false),"totalBroadcastsCount":(\d+|null)/
    );

    // Extract liveStream object fields
    const liveStreamMatch = text.match(
      /"liveStream":\{[^}]*"id":"([^"]+)"[^}]*"url":"([^"]+)"[^}]*"mp3Url":(null|"[^"]*")[^}]*"wavUrl":(null|"[^"]*")[^}]*"start":(\d+)[^}]*"end":(\d+|null)[^}]*"isFinished":(true|false)/
    );

    if (!statusMatch && !liveStreamMatch) {
      // Check if user exists but never broadcast
      if (text.includes('"availableBroadcastsCount":0')) {
        return { handle, state: 'none', message: 'Never broadcast' };
      }
      return { handle, state: 'none', message: 'No broadcast data found' };
    }

    const isLive = statusMatch ? statusMatch[3] === 'true' : false;

    if (!liveStreamMatch) {
      return {
        handle,
        state: isLive ? 'live' : 'none',
        message: 'Status detected but no stream details found',
      };
    }

    const broadcastId = liveStreamMatch[1];
    const streamUrl = liveStreamMatch[2];
    const mp3Url = liveStreamMatch[3] === 'null' ? null : liveStreamMatch[3].replace(/^"|"$/g, '');
    const wavUrl = liveStreamMatch[4] === 'null' ? null : liveStreamMatch[4].replace(/^"|"$/g, '');
    const start = parseInt(liveStreamMatch[5], 10);
    const end = liveStreamMatch[6] === 'null' ? null : parseInt(liveStreamMatch[6], 10);
    const isFinished = liveStreamMatch[7] === 'true';

    // Determine state
    if (!isFinished && end === null) {
      return {
        handle,
        state: 'live',
        url: streamUrl,
        broadcastId,
        start,
        listeners: extractListeners(text),
      };
    }

    if (mp3Url && mp3Url.startsWith('https://storage.googleapis.com')) {
      return {
        handle,
        state: 'archived',
        url: mp3Url,
        wavUrl,
        broadcastId,
        start,
        end,
      };
    }

    return {
      handle,
      state: 'expired',
      broadcastId,
      start,
      end,
    };

  } catch (err) {
    return { handle, state: 'error', error: err.message };
  }
}

function extractListeners(text) {
  const match = text.match(/"numberOfListeners":(\d+)/);
  return match ? parseInt(match[1], 10) : null;
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
