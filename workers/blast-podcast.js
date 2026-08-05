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
    const text = raw.replaceAll('\\"', '"').replaceAll('\\u0026', '&');

    const liveStreamMatch = text.match(
      /"liveStream":\{[^}]*"id":"([^"]+)"[^}]*"url":"([^"]+)"[^}]*"mp3Url":(null|"[^"]*")[^}]*"wavUrl":(null|"[^"]*")[^}]*"start":(\d+)[^}]*"end":(\d+|null)[^}]*"isFinished":(true|false)/
    );

    if (!liveStreamMatch) {
      return { handle: show.handle, state: 'none' };
    }

    const broadcastId = liveStreamMatch[1];
    const mp3Url = liveStreamMatch[3] === 'null' ? null : liveStreamMatch[3].replace(/^"|"$/g, '');
    const start = parseInt(liveStreamMatch[5], 10);
    const end = liveStreamMatch[6] === 'null' ? null : parseInt(liveStreamMatch[6], 10);
    const isFinished = liveStreamMatch[7] === 'true';

    if (isFinished && mp3Url && mp3Url.startsWith('https://storage.googleapis.com')) {
      return { handle: show.handle, state: 'archived', url: mp3Url, broadcastId, start, end };
    }

    return { handle: show.handle, state: isFinished ? 'expired' : 'live' };
  } catch (err) {
    return { handle: show.handle, state: 'error' };
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
