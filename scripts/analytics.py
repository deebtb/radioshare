#!/usr/bin/env python3
"""
Query deeradio.uk play analytics from Cloudflare Analytics Engine.

Setup:
  1. Copy .env.example to .env and fill in your values
  2. pip install requests python-dotenv (if not already installed)
  3. python scripts/analytics.py

Or set environment variables directly:
  export CF_ACCOUNT_ID="your_account_id"
  export CF_API_TOKEN="your_api_token"
"""

import os
import sys
import requests
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, rely on env vars

ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID")
API_TOKEN = os.environ.get("CF_API_TOKEN")
ENDPOINT = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/analytics_engine/sql"

QUERIES = {
    "top_stations": """
        SELECT blob1 as station, blob2 as page, count() as plays
        FROM plays
        WHERE timestamp > now() - interval '7' day
        GROUP BY station, page
        ORDER BY plays DESC
        LIMIT 30
    """,
    "today": """
        SELECT blob1 as station, blob2 as page, blob3 as action, count() as events
        FROM plays
        WHERE timestamp > now() - interval '1' day
        GROUP BY station, page, action
        ORDER BY events DESC
        LIMIT 30
    """,
    "by_country": """
        SELECT blob4 as country, count() as plays
        FROM plays
        WHERE timestamp > now() - interval '7' day
        GROUP BY country
        ORDER BY plays DESC
        LIMIT 20
    """,
    "unique_listeners": """
        SELECT blob2 as page, count(DISTINCT blob5) as unique_listeners, count() as total_plays
        FROM plays
        WHERE timestamp > now() - interval '7' day
        GROUP BY page
        ORDER BY unique_listeners DESC
    """,
    "recent": """
        SELECT timestamp, blob1 as station, blob2 as page, blob3 as action, blob4 as country, blob5 as visitor
        FROM plays
        ORDER BY timestamp DESC
        LIMIT 20
    """,
}


def run_query(name, sql):
    """Execute a SQL query against Analytics Engine."""
    resp = requests.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {API_TOKEN}"},
        data=sql.strip(),
    )

    if resp.status_code != 200:
        print(f"  Error: HTTP {resp.status_code}")
        print(f"  {resp.text[:200]}")
        return

    data = resp.json()
    if not data.get("data"):
        print("  No data yet.")
        return

    rows = data["data"]
    if not rows:
        print("  No results.")
        return

    # Print as a simple table
    cols = list(rows[0].keys())
    widths = {c: max(len(c), max(len(str(r.get(c, ""))) for r in rows)) for c in cols}

    header = " | ".join(c.ljust(widths[c]) for c in cols)
    print(f"  {header}")
    print(f"  {'-+-'.join('-' * widths[c] for c in cols)}")
    for row in rows:
        line = " | ".join(str(row.get(c, "")).ljust(widths[c]) for c in cols)
        print(f"  {line}")


def main():
    if not ACCOUNT_ID or not API_TOKEN:
        print("Error: Missing CF_ACCOUNT_ID or CF_API_TOKEN.")
        print("Set them in .env or as environment variables.")
        print("See .env.example for the format.")
        sys.exit(1)

    print(f"=== deeradio.uk Play Analytics ===")
    print(f"    {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print()

    # Default to showing all reports, or accept a specific one
    if len(sys.argv) > 1:
        name = sys.argv[1]
        if name not in QUERIES:
            print(f"Unknown report: {name}")
            print(f"Available: {', '.join(QUERIES.keys())}")
            sys.exit(1)
        reports = {name: QUERIES[name]}
    else:
        reports = QUERIES

    for name, sql in reports.items():
        title = name.replace("_", " ").title()
        print(f"--- {title} ---")
        run_query(name, sql)
        print()


if __name__ == "__main__":
    main()
