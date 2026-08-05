/**
 * Cloudflare Worker: ICY Metadata Proxy
 *
 * Proxies radio stream requests adding the Icy-MetaData header server-side,
 * then exposes the icy-metaint header via CORS so browsers can read inline metadata.
 *
 * This solves two browser limitations:
 * 1. Custom headers like "Icy-MetaData: 1" trigger CORS preflight on many servers
 * 2. Servers don't include icy-metaint in Access-Control-Expose-Headers
 *
 * Usage: GET /?url=https://stream.radioparadise.com/aac-128
 *        Returns the audio stream with proper CORS headers exposed.
 *
 * The client reads the first metadata block then disconnects (peek mode).
 * Worker auto-disconnects after 30 seconds to prevent runaway connections.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker → paste this.
 * Route: icy-proxy.YOUR_SUBDOMAIN.workers.dev
 */

const ALLOWED_ORIGINS = ['https://deeradio.uk', 'http://localhost:3333', 'http://localhost:8080'];
const MAX_STREAM_SECONDS = 30;

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    const streamUrl = reqUrl.searchParams.get('url');
    if (!streamUrl) {
      return jsonResponse({ error: 'Missing ?url= parameter' }, 400, request);
    }

    // Validate URL
    try {
      new URL(streamUrl);
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400, request);
    }

    try {
      const upstreamResp = await fetch(streamUrl, {
        headers: {
          'Icy-MetaData': '1',
          'User-Agent': 'deeradio-icy-proxy/1.0',
        },
        redirect: 'follow',
      });

      if (!upstreamResp.ok) {
        return jsonResponse({ error: `Upstream returned ${upstreamResp.status}` }, 502, request);
      }

      // Build response headers — expose ICY headers to the browser
      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', upstreamResp.headers.get('content-type') || 'audio/mpeg');
      responseHeaders.set('Cache-Control', 'no-cache, no-store');

      // Forward all icy-* headers
      for (const [key, value] of upstreamResp.headers.entries()) {
        if (key.startsWith('icy-')) {
          responseHeaders.set(key, value);
        }
      }

      // CORS headers — expose icy-metaint so browser JS can read it
      const origin = request.headers.get('Origin') || '*';
      responseHeaders.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
      responseHeaders.set('Access-Control-Expose-Headers', 'icy-metaint, icy-br, icy-name, icy-description, icy-genre, icy-url, Content-Type');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

      // Stream the body through, with a time limit
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const reader = upstreamResp.body.getReader();

      // Auto-close after MAX_STREAM_SECONDS
      const timeout = setTimeout(() => {
        reader.cancel();
        writer.close().catch(() => {});
      }, MAX_STREAM_SECONDS * 1000);

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        } catch {
          // Client disconnected or timeout
        } finally {
          clearTimeout(timeout);
          writer.close().catch(() => {});
        }
      })();

      return new Response(readable, {
        status: 200,
        headers: responseHeaders,
      });

    } catch (err) {
      return jsonResponse({ error: 'Proxy error: ' + err.message }, 502, request);
    }
  }
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, request) {
  const origin = request.headers.get('Origin') || '*';
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    },
  });
}
