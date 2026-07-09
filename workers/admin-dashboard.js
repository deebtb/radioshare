/**
 * Cloudflare Worker: Admin Dashboard
 *
 * Serves the admin dashboard HTML and queries Analytics Engine via REST API.
 * Protected by Cloudflare Access on admin.deeradio.uk.
 *
 * Deploy:
 *   1. Create a new Worker named "admin-dashboard"
 *   2. Paste this code
 *   3. Add secrets (Settings → Variables and Secrets):
 *      - CF_ACCOUNT_ID (type: secret) = your account ID
 *      - CF_API_TOKEN (type: secret) = your analytics API token
 *   4. Connect to admin.deeradio.uk (Custom Domain or DNS CNAME)
 *   5. Cloudflare Access protects admin.deeradio.uk (already configured)
 *
 * Routes:
 *   GET /          → Dashboard HTML
 *   GET /api/stats → JSON analytics data
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/stats') {
      return handleStats(env);
    }

    // Serve the dashboard HTML for all other paths
    return new Response(DASHBOARD_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
};

async function handleStats(env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return jsonResponse({ error: 'Missing CF_ACCOUNT_ID or CF_API_TOKEN secrets' }, 500);
  }

  try {
    const [topStations, recentActivity, overview, byCountry, stationListeners] = await Promise.all([
      queryAnalytics(env, `
        SELECT blob1 as station, blob2 as page, count() as plays, count(DISTINCT blob5) as visitors
        FROM plays
        WHERE timestamp > now() - interval '7' day AND blob3 = 'play'
        GROUP BY station, page
        ORDER BY plays DESC
        LIMIT 20
      `),
      queryAnalytics(env, `
        SELECT timestamp, blob1 as station, blob2 as page, blob3 as action, blob4 as country, blob5 as visitor
        FROM plays
        ORDER BY timestamp DESC
        LIMIT 30
      `),
      queryAnalytics(env, `
        SELECT
          count() as total_plays,
          count(DISTINCT blob5) as unique_visitors,
          count(DISTINCT blob1) as unique_stations,
          count(DISTINCT blob4) as unique_countries
        FROM plays
        WHERE timestamp > now() - interval '7' day AND blob3 = 'play'
      `),
      queryAnalytics(env, `
        SELECT blob4 as country, count() as plays
        FROM plays
        WHERE timestamp > now() - interval '7' day AND blob3 = 'play'
        GROUP BY country
        ORDER BY plays DESC
        LIMIT 15
      `),
      queryAnalytics(env, `
        SELECT blob1 as station, blob5 as visitor, count() as plays
        FROM plays
        WHERE timestamp > now() - interval '7' day AND blob3 = 'play' AND blob5 != 'anonymous'
        GROUP BY station, visitor
        ORDER BY station, plays DESC
        LIMIT 100
      `),
    ]);

    return jsonResponse({
      topStations: topStations || [],
      recentActivity: recentActivity || [],
      overview: (overview && overview[0]) || {},
      byCountry: byCountry || [],
      stationListeners: stationListeners || [],
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

async function queryAnalytics(env, sql) {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
      },
      body: sql.trim(),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Analytics API error: HTTP ${resp.status} - ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.data || [];
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - deeradio.uk</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
            background: #f0f4f8; color: #2d3748; min-height: 100vh;
        }
        header {
            background: #1a365d; padding: 0.75rem 1.5rem; border-bottom: 3px solid #2c5282;
            display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        }
        header h1 { font-size: clamp(1.2rem, 3vw, 1.75rem); color: #fff; }
        .header-meta { font-size: 0.8rem; color: #bee3f8; }
        .refresh-btn {
            background: #fbd38d; border: none; border-radius: 8px; padding: 0.4rem 0.8rem;
            font-size: 1.25rem; cursor: pointer; transition: transform 0.2s; line-height: 1;
        }
        .refresh-btn:hover { transform: scale(1.2) rotate(15deg); background: #f6e05e; }
        main { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
        .section-title {
            font-size: 1.25rem; color: #2d3748; margin-bottom: 1rem;
            padding-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0;
        }
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem; margin-bottom: 2rem;
        }
        .stat-card {
            background: #fff; border-radius: 12px; padding: 1.25rem;
            border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center;
        }
        .stat-value { font-size: 2rem; font-weight: 700; color: #2b6cb0; }
        .stat-label { font-size: 0.8rem; color: #718096; margin-top: 0.25rem; }
        .data-table {
            width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px;
            overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            margin-bottom: 2rem;
        }
        .data-table th {
            background: #2b6cb0; color: #fff; padding: 0.75rem 1rem;
            text-align: left; font-size: 0.85rem; font-weight: 600;
        }
        .data-table td { padding: 0.6rem 1rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: #ebf8ff; }
        .loading { text-align: center; padding: 2rem; color: #718096; }
        .error { background: #fed7d7; color: #c53030; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
        @media (max-width: 600px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            header { flex-direction: column; align-items: stretch; }
        }
    </style>
</head>
<body>
    <header>
        <h1>&#128274; Admin Dashboard</h1>
        <button class="refresh-btn" id="refresh-btn" title="Refresh data">&#128260;</button>
        <span class="header-meta" id="header-meta"></span>
    </header>
    <main>
        <section>
            <h2 class="section-title">Overview (last 7 days)</h2>
            <div class="stats-grid" id="stats-grid">
                <div class="stat-card"><span class="stat-value" id="stat-plays">&mdash;</span><div class="stat-label">Total Plays</div></div>
                <div class="stat-card"><span class="stat-value" id="stat-visitors">&mdash;</span><div class="stat-label">Unique Visitors</div></div>
                <div class="stat-card"><span class="stat-value" id="stat-stations">&mdash;</span><div class="stat-label">Stations Played</div></div>
                <div class="stat-card"><span class="stat-value" id="stat-countries">&mdash;</span><div class="stat-label">Countries</div></div>
            </div>
        </section>
        <section>
            <h2 class="section-title">Top Stations (7 days)</h2>
            <div id="top-stations"><p class="loading">Loading...</p></div>
        </section>
        <section>
            <h2 class="section-title">Station Listeners (7 days)</h2>
            <div id="station-listeners"><p class="loading">Loading...</p></div>
        </section>
        <section>
            <h2 class="section-title">By Country (7 days)</h2>
            <div id="by-country"><p class="loading">Loading...</p></div>
        </section>
        <section>
            <h2 class="section-title">Recent Activity</h2>
            <div id="recent-activity"><p class="loading">Loading...</p></div>
        </section>
    </main>
    <script>
        async function fetchData() {
            document.getElementById('header-meta').textContent = 'Loading...';
            try {
                const resp = await fetch('/api/stats');
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                if (data.error) throw new Error(data.error);
                renderDashboard(data);
                document.getElementById('header-meta').textContent = 'Updated: ' + new Date().toLocaleTimeString();
            } catch (err) {
                document.getElementById('header-meta').textContent = 'Error: ' + err.message;
                console.error(err);
            }
        }

        function renderDashboard(data) {
            const o = data.overview;
            document.getElementById('stat-plays').textContent = o.total_plays || 0;
            document.getElementById('stat-visitors').textContent = o.unique_visitors || 0;
            document.getElementById('stat-stations').textContent = o.unique_stations || 0;
            document.getElementById('stat-countries').textContent = o.unique_countries || 0;

            // Top stations table
            if (data.topStations.length > 0) {
                let html = '<table class="data-table"><tr><th>#</th><th>Station</th><th>Page</th><th>Plays</th><th>Visitors</th></tr>';
                data.topStations.forEach((row, i) => {
                    html += '<tr><td>' + (i+1) + '</td><td>' + esc(row.station) + '</td><td>' + esc(row.page) + '</td><td>' + row.plays + '</td><td>' + (row.visitors || 0) + '</td></tr>';
                });
                html += '</table>';
                document.getElementById('top-stations').innerHTML = html;
            } else {
                document.getElementById('top-stations').innerHTML = '<p class="loading">No data yet.</p>';
            }

            // Station listeners (grouped by station, showing visitor GUIDs)
            if (data.stationListeners.length > 0) {
                // Group by station
                const grouped = {};
                data.stationListeners.forEach(row => {
                    if (!grouped[row.station]) grouped[row.station] = [];
                    grouped[row.station].push({ visitor: row.visitor, plays: row.plays });
                });
                let html = '<table class="data-table"><tr><th>Station</th><th>Visitor</th><th>Plays</th></tr>';
                Object.keys(grouped).forEach(station => {
                    grouped[station].forEach((v, i) => {
                        html += '<tr><td>' + (i === 0 ? esc(station) : '') + '</td><td>' + v.visitor.slice(0,8) + '...</td><td>' + v.plays + '</td></tr>';
                    });
                });
                html += '</table>';
                document.getElementById('station-listeners').innerHTML = html;
            } else {
                document.getElementById('station-listeners').innerHTML = '<p class="loading">No data yet.</p>';
            }

            // By country
            if (data.byCountry.length > 0) {
                let html = '<table class="data-table"><tr><th>Country</th><th>Plays</th></tr>';
                data.byCountry.forEach(row => {
                    html += '<tr><td>' + esc(row.country) + '</td><td>' + row.plays + '</td></tr>';
                });
                html += '</table>';
                document.getElementById('by-country').innerHTML = html;
            } else {
                document.getElementById('by-country').innerHTML = '<p class="loading">No data yet.</p>';
            }

            // Recent activity
            if (data.recentActivity.length > 0) {
                let html = '<table class="data-table"><tr><th>Time</th><th>Station</th><th>Page</th><th>Country</th><th>Visitor</th></tr>';
                data.recentActivity.forEach(row => {
                    const time = row.timestamp ? new Date(row.timestamp).toLocaleString() : '';
                    const visitor = row.visitor ? row.visitor.slice(0, 8) + '...' : '';
                    html += '<tr><td>' + time + '</td><td>' + esc(row.station) + '</td><td>' + esc(row.page) + '</td><td>' + esc(row.country) + '</td><td>' + visitor + '</td></tr>';
                });
                html += '</table>';
                document.getElementById('recent-activity').innerHTML = html;
            } else {
                document.getElementById('recent-activity').innerHTML = '<p class="loading">No data yet.</p>';
            }
        }

        function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        document.getElementById('refresh-btn').addEventListener('click', fetchData);
        fetchData();
    </script>
</body>
</html>`;
