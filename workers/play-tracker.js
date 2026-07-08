/**
 * Cloudflare Worker: Play Event Tracker
 *
 * Receives play events from deeradio.uk pages via sendBeacon/fetch
 * and writes them to Workers Analytics Engine.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker → paste this.
 * Binding: Add an Analytics Engine binding named "PLAYS" with dataset "plays"
 *
 * Setup:
 *   1. Deploy this Worker
 *   2. In Worker Settings → Variables → Analytics Engine Bindings:
 *      Variable name: PLAYS
 *      Dataset: plays
 *   3. Route it or use the workers.dev URL
 *
 * Usage from frontend:
 *   navigator.sendBeacon(TRACKER_URL, JSON.stringify({
 *     station: "Exclusively Beatles",
 *     page: "index",
 *     action: "play"
 *   }));
 *
 * Query data via:
 *   curl -X POST "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/analytics_engine/sql" \
 *     -H "Authorization: Bearer API_TOKEN" \
 *     -d "SELECT blob1 as station, blob2 as page, blob3 as action, count() as plays
 *         FROM plays
 *         WHERE timestamp > now() - interval '7' day
 *         GROUP BY station, page, action
 *         ORDER BY plays DESC
 *         LIMIT 50"
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // Accept POST (sendBeacon) and GET (for simple pings)
    if (request.method !== 'POST' && request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    let station = 'unknown';
    let page = 'unknown';
    let action = 'play';

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        station = body.station || 'unknown';
        page = body.page || 'unknown';
        action = body.action || 'play';
      } catch {
        return new Response('Bad JSON', { status: 400, headers: corsHeaders() });
      }
    } else {
      // GET fallback: ?station=X&page=Y&action=Z
      const url = new URL(request.url);
      station = url.searchParams.get('station') || 'unknown';
      page = url.searchParams.get('page') || 'unknown';
      action = url.searchParams.get('action') || 'play';
    }

    // Get visitor info from Cloudflare headers
    const country = request.headers.get('cf-connecting-country') || 'unknown';
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

    // Hash the IP for a pseudo-anonymous visitor ID (not PII)
    const visitorId = await hashIP(ip);

    // Write to Analytics Engine
    if (env.PLAYS) {
      env.PLAYS.writeDataPoint({
        blobs: [
          station.slice(0, 255),   // blob1: station name
          page.slice(0, 50),       // blob2: page (index, bob, blast, etc.)
          action.slice(0, 20),     // blob3: action (play, stop)
          country,                 // blob4: country code
          visitorId,               // blob5: hashed visitor ID
        ],
        doubles: [1],              // double1: event count (always 1)
        indexes: [station.slice(0, 96)], // index: station (for efficient queries)
      });
    }

    return new Response('ok', {
      status: 200,
      headers: corsHeaders(),
    });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + '-deeradio-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(hash);
  return Array.from(arr.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
