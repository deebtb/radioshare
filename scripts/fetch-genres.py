#!/usr/bin/env python3
"""
Fetch genre tags from Last.fm for each artist in exclusive-radio.csv.
Produces streams/exclusive-radio-genres.csv with genre columns added.

Usage: python3 scripts/fetch-genres.py
"""

import csv
import json
import time
import urllib.request
import urllib.parse
import re
import sys
import ssl

# macOS Python often lacks system certs — use unverified context for this script
SSL_CTX = ssl.create_default_context()
try:
    import certifi
    SSL_CTX.load_verify_locations(certifi.where())
except ImportError:
    SSL_CTX.check_hostname = False
    SSL_CTX.verify_mode = ssl.CERT_NONE

API_KEY = "ea18fa7c4f9db91a575094ed17e14b97"
BASE_URL = "https://ws.audioscrobbler.com/2.0/"

def extract_artist(station_name):
    """Extract artist name from station name like 'Exclusively Beatles' or 'EXCLUSIVELY JAZZ'"""
    # Remove "Exclusively" / "Exclusvely" prefix (there's a typo in the CSV)
    name = re.sub(r'^Exclus[iv]+ely\s+', '', station_name, flags=re.IGNORECASE)
    # Remove "EXCLUSIVELY " prefix for all-caps entries
    name = re.sub(r'^EXCLUSIVELY\s+', '', name, flags=re.IGNORECASE)
    return name.strip()

def get_artist_tags(artist_name):
    """Query Last.fm for top tags of an artist. Returns list of tag names."""
    params = urllib.parse.urlencode({
        'method': 'artist.getTopTags',
        'artist': artist_name,
        'api_key': API_KEY,
        'format': 'json'
    })
    url = f"{BASE_URL}?{params}"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'RadioShare/1.0'})
        with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
            data = json.loads(resp.read().decode())
        
        if 'toptags' in data and 'tag' in data['toptags']:
            tags = data['toptags']['tag']
            # Return top 3 tags with count > 0
            top_tags = [t['name'].lower() for t in tags[:5] if int(t.get('count', 0)) > 0]
            return top_tags[:3]
        return []
    except Exception as e:
        print(f"  Error fetching tags for '{artist_name}': {e}", file=sys.stderr)
        return []

def main():
    input_file = "streams/exclusive-radio.csv"
    output_file = "streams/exclusive-radio-genres.csv"
    
    # Read the CSV
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
        
        if not name or not url.startswith('http'):
            continue
        
        artist = extract_artist(name)
        total += 1
        
        print(f"[{total}] Looking up: {artist}...", end=' ')
        tags = get_artist_tags(artist)
        
        if tags:
            found += 1
            print(f"-> {', '.join(tags)}")
        else:
            print("-> (no tags found)")
        
        genre_str = '|'.join(tags) if tags else ''
        results.append((idx, name, url, genre_str))
        
        # Rate limit: 1 request per second max (Last.fm TOS)
        time.sleep(0.25)
    
    # Write enriched CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        f.write(',NAME,PUBLIC STREAM,GENRES\n')
        f.write(',,,\n')
        for idx, name, url, genres in results:
            # Escape fields with commas
            if ',' in name:
                name = f'"{name}"'
            f.write(f'{idx},{name},{url},{genres}\n')
    
    print(f"\nDone! {found}/{total} artists had genre tags.")
    print(f"Output written to {output_file}")

if __name__ == '__main__':
    main()
