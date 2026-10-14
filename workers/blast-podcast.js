/**
 * Cloudflare Worker: Blast Radio Podcast Feed
 *
 * Generates an iTunes/RSS-compliant podcast XML feed from archived Blast Radio shows.
 * Each time a podcast client fetches the feed, we scrape the current archive URLs
 * from blastradio.com profiles and emit them as episodes.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker → paste this.
 * Route: deeradio.uk/api/blast-podcast (or blast-podcast.YOUR_SUBDOMAIN.workers.dev)
 *
 * Usage: GET /api/blast-podcast
 *        Returns: application/rss+xml podcast feed
 */

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

const FEED_TITLE = 'Blast Radio Archives';
const FEED_DESCRIPTION = 'Archived broadcasts from Blast Radio DJs — a lo-fi, one-channel-at-a-time broadcasting platform. Subscribe to catch shows you missed.';
const FEED_LINK = 'https://deeradio.uk/blast.html';
const FEED_IMAGE = 'https://deeradio.uk/android-chrome-512x512.png';
const FEED_AUTHOR = 'deeradio.uk';
const FEED_LANGUAGE = 'en';
const FEED_CATEGORY = 'Music';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Fetch status for all shows in parallel
      const results = await Promise.all(SHOWS.map(fetchBlastStatus));

      // Filter to only archived episodes with playable URLs
      const episodes = results.filter(r => r.state === 'archived' && r.url);

      // Build RSS XML
      const rss = buildRSSFeed(episodes, url.origin);

      return new Response(rss, {
        status: 200,
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=900, s-maxage=900',
          ...corsHeaders(),
        },
      });
    } catch (err) {
      return new Response(`<!-- Error generating feed: ${escapeXml(err.message)} -->`, {
        status: 500,
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
      });
    }
  }
};

function buildRSSFeed(episodes, origin) {
  const now = new Date().toUTCString();
  const selfUrl = `${origin}/api/blast-podcast`;

  let items = '';
  for (const ep of episodes) {
    const show = SHOWS.find(s => s.handle === ep.handle);
    const title = show ? show.name : ep.handle;
    const pubDate = ep.end ? new Date(ep.end * 1000).toUTCString() : now;
    const duration = ep.start && ep.end ? formatDuration(ep.end - ep.start) : '';
    const description = `Archived broadcast from ${title} on Blast Radio.`;
    const guid = `blast-${ep.handle}-${ep.broadcastId || ep.start}`;
    const link = `https://blastradio.com/${ep.handle}`;

    items += `
    <item>
      <title>${escapeXml(title)} — ${formatDate(ep.end || ep.start)}</title>
      <description>${escapeXml(description)}</description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${escapeXml(ep.url)}" type="audio/mpeg" length="0" />
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <link>${escapeXml(link)}</link>
      <itunes:author>${escapeXml(title)}</itunes:author>
      <itunes:subtitle>Blast Radio archive</itunes:subtitle>
      <itunes:summary>${escapeXml(description)}</itunes:summary>${duration ? `
      <itunes:duration>${duration}</itunes:duration>` : ''}
      <itunes:explicit>false</itunes:explicit>
    </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(FEED_LINK)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>${FEED_LANGUAGE}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />
    <image>
      <url>${escapeXml(FEED_IMAGE)}</url>
      <title>${escapeXml(FEED_TITLE)}</title>
      <link>${escapeXml(FEED_LINK)}</link>
    </image>
    <itunes:author>${escapeXml(FEED_AUTHOR)}</itunes:author>
    <itunes:summary>${escapeXml(FEED_DESCRIPTION)}</itunes:summary>
    <itunes:category text="${escapeXml(FEED_CATEGORY)}" />
    <itunes:image href="${escapeXml(FEED_IMAGE)}" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:owner>
      <itunes:name>${escapeXml(FEED_AUTHOR)}</itunes:name>
    </itunes:owner>${items}
  </channel>
</rss>`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchBlastStatus(show) {
  try {
    const resp = await fetch(`https://blastradio.com/${show.handle}`, {
      headers: { 'User-Agent': 'deeradio-podcast/1.0' },
    });

    if (!resp.ok) {
      return { handle: show.handle, state: 'error' };
    }

    const raw = await resp.text();
    // Unescape Next.js flight payload (quotes are backslash-escaped, & is \u0026)
    const text = raw.replaceAll('\\"', '"').replaceAll('\\u0026', '&');

    return parseBlastStatus(show.handle, text);
  } catch (err) {
    return { handle: show.handle, state: 'error' };
  }
}

/**
 * Parse broadcast state from an unescaped Next.js flight payload.
 *
 * Blast Radio moved finished broadcasts out of the `liveStream` object (now null
 * when nothing is live) into a `recentStreams` array whose entries share the same
 * field shape. We read both: a non-finished `liveStream` means the show is live;
 * otherwise the newest `recentStreams` entry determines archived/expired.
 *
 * NOTE: this is a self-contained duplicate of the helper in blast-status.js so each
 * file deploys as a standalone Cloudflare Worker. Keep the two copies in sync.
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
