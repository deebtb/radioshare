#!/usr/bin/env python3
"""
Fetch broad genre categories from MusicBrainz for each artist in exclusive-radio-genres.csv.
Adds a CATEGORY column to produce exclusive-radio-full.csv.

MusicBrainz rate limit: 1 request per second (no auth needed).

Usage: python3 scripts/fetch-categories.py
"""

import json
import time
import urllib.request
import urllib.parse
import re
import sys
import ssl

# macOS Python SSL fix
SSL_CTX = ssl.create_default_context()
try:
    import certifi
    SSL_CTX.load_verify_locations(certifi.where())
except ImportError:
    SSL_CTX.check_hostname = False
    SSL_CTX.verify_mode = ssl.CERT_NONE

MB_BASE = "https://musicbrainz.org/ws/2"
USER_AGENT = "RadioShare/1.0 (https://deebtb.github.io/radioshare/)"


def extract_artist(station_name):
    """Extract artist name from station name."""
    name = re.sub(r'^Exclus[iv]+ely\s+', '', station_name, flags=re.IGNORECASE)
    name = re.sub(r'^EXCLUSIVELY\s+', '', name, flags=re.IGNORECASE)
    return name.strip()


def search_artist_genres(artist_name):
    """Search MusicBrainz for an artist and return their genres."""
    params = urllib.parse.urlencode({
        'query': f'artist:"{artist_name}"',
        'fmt': 'json',
        'limit': '1'
    })
    url = f"{MB_BASE}/artist/?{params}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
            data = json.loads(resp.read().decode())

        artists = data.get('artists', [])
        if not artists:
            return []

        # Get the top match
        artist = artists[0]
        tags = artist.get('tags', [])
        
        # MusicBrainz tags have a "count" (votes) — sort by count
        tags.sort(key=lambda t: t.get('count', 0), reverse=True)
        
        # Filter to broad genre categories (skip very specific descriptors)
        broad_genres = set()
        genre_keywords = {
            'rock', 'pop', 'jazz', 'blues', 'classical', 'electronic', 'metal',
            'folk', 'country', 'soul', 'funk', 'reggae', 'hip hop', 'rap',
            'r&b', 'punk', 'disco', 'house', 'techno', 'ambient', 'latin',
            'ska', 'gospel', 'swing', 'opera', 'new wave', 'grunge',
            'alternative', 'indie', 'dance', 'world'
        }
        
        for tag in tags:
            tag_name = tag['name'].lower()
            # Check if this tag matches or contains a broad genre
            if tag_name in genre_keywords:
                broad_genres.add(tag_name)
            else:
                # Check if any genre keyword is a substring
                for keyword in genre_keywords:
                    if keyword in tag_name:
                        broad_genres.add(keyword)
                        break
        
        return sorted(broad_genres)[:3]
    except Exception as e:
        print(f"  Error: {e}", file=sys.stderr)
        return []


def main():
    input_file = "streams/exclusive-radio-genres.csv"
    output_file = "streams/exclusive-radio-full.csv"

    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    results = []
    total = 0
    found = 0

    for i, line in enumerate(lines):
        if i < 2 or not line.strip():
            continue

        # Parse CSV line
        fields = []
        current = ''
        in_quotes = False
        for char in line:
            if char == '"':
                in_quotes = not in_quotes
            elif char == ',' and not in_quotes:
                fields.append(current.strip())
                current = ''
            else:
                current += char
        fields.append(current.strip())

        if len(fields) < 3:
            continue

        idx = fields[0]
        name = fields[1]
        url = fields[2]
        lastfm_genres = fields[3] if len(fields) > 3 else ''

        if not name or not url.startswith('http'):
            continue

        artist = extract_artist(name)
        total += 1

        print(f"[{total}] {artist}...", end=' ')
        categories = search_artist_genres(artist)

        if categories:
            found += 1
            print(f"-> {', '.join(categories)}")
        else:
            print("-> (none)")

        cat_str = '|'.join(categories) if categories else ''
        results.append((idx, name, url, lastfm_genres, cat_str))

        # MusicBrainz requires 1 req/sec
        time.sleep(1.1)

    # Write full CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        f.write(',NAME,PUBLIC STREAM,GENRES,CATEGORY\n')
        f.write(',,,,\n')
        for idx, name, url, genres, category in results:
            if ',' in name:
                name = f'"{name}"'
            f.write(f'{idx},{name},{url},{genres},{category}\n')

    print(f"\nDone! {found}/{total} artists had MusicBrainz categories.")
    print(f"Output written to {output_file}")


if __name__ == '__main__':
    main()
