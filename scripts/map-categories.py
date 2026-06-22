#!/usr/bin/env python3
"""
Map Last.fm fine-grained tags to broad categories.
Reads exclusive-radio-genres.csv and produces exclusive-radio-full.csv
with a CATEGORY column derived from the GENRES column.

No API calls needed — pure local mapping.

Usage: python3 scripts/map-categories.py
"""

# Map fine-grained Last.fm tags to broad categories
TAG_TO_CATEGORY = {
    # Rock
    'rock': 'Rock',
    'classic rock': 'Rock',
    'hard rock': 'Rock',
    'soft rock': 'Rock',
    'blues rock': 'Rock',
    'southern rock': 'Rock',
    'progressive rock': 'Rock',
    'psychedelic rock': 'Rock',
    'garage rock': 'Rock',
    'indie rock': 'Rock',
    'art rock': 'Rock',
    'glam rock': 'Rock',
    'surf rock': 'Rock',
    
    # Metal
    'heavy metal': 'Metal',
    'metal': 'Metal',
    'thrash metal': 'Metal',
    'death metal': 'Metal',
    'black metal': 'Metal',
    'doom metal': 'Metal',
    'nu metal': 'Metal',
    'symphonic metal': 'Metal',
    
    # Pop
    'pop': 'Pop',
    'synthpop': 'Pop',
    'indie pop': 'Pop',
    'electropop': 'Pop',
    'britpop': 'Pop',
    'dream pop': 'Pop',
    'power pop': 'Pop',
    'teen pop': 'Pop',
    
    # Alternative / Indie
    'alternative': 'Alternative',
    'alternative rock': 'Alternative',
    'indie': 'Alternative',
    'grunge': 'Alternative',
    'post-punk': 'Alternative',
    'new wave': 'Alternative',
    'shoegaze': 'Alternative',
    
    # Electronic / Dance
    'electronic': 'Electronic',
    'dance': 'Electronic',
    'house': 'Electronic',
    'techno': 'Electronic',
    'trance': 'Electronic',
    'edm': 'Electronic',
    'ambient': 'Electronic',
    'dubstep': 'Electronic',
    'drum and bass': 'Electronic',
    
    # Hip Hop / Rap
    'hip-hop': 'Hip Hop',
    'hip hop': 'Hip Hop',
    'rap': 'Hip Hop',
    'gangsta rap': 'Hip Hop',
    'trap': 'Hip Hop',
    'conscious hip hop': 'Hip Hop',
    
    # R&B / Soul
    'soul': 'Soul/R&B',
    'rnb': 'Soul/R&B',
    'r&b': 'Soul/R&B',
    'rhythm and blues': 'Soul/R&B',
    'neo-soul': 'Soul/R&B',
    'motown': 'Soul/R&B',
    'funk': 'Soul/R&B',
    
    # Blues
    'blues': 'Blues',
    'delta blues': 'Blues',
    'electric blues': 'Blues',
    'chicago blues': 'Blues',
    
    # Jazz
    'jazz': 'Jazz',
    'smooth jazz': 'Jazz',
    'bebop': 'Jazz',
    'cool jazz': 'Jazz',
    'swing': 'Jazz',
    'big band': 'Jazz',
    
    # Country
    'country': 'Country',
    'country rock': 'Country',
    'outlaw country': 'Country',
    'classic country': 'Country',
    'americana': 'Country',
    'bluegrass': 'Country',
    'honky tonk': 'Country',
    
    # Folk
    'folk': 'Folk',
    'folk rock': 'Folk',
    'singer-songwriter': 'Folk',
    'acoustic': 'Folk',
    'irish folk': 'Folk',
    
    # Classical
    'classical': 'Classical',
    'piano': 'Classical',
    'romantic': 'Classical',
    'baroque': 'Classical',
    'opera': 'Classical',
    'orchestral': 'Classical',
    
    # Reggae
    'reggae': 'Reggae',
    'roots reggae': 'Reggae',
    'ska': 'Reggae',
    'dub': 'Reggae',
    'rocksteady': 'Reggae',
    'dancehall': 'Reggae',
    
    # Latin
    'latin': 'Latin',
    'reggaeton': 'Latin',
    'salsa': 'Latin',
    'bossa nova': 'Latin',
    'brazilian': 'Latin',
    
    # Disco
    'disco': 'Disco',
    
    # Decades
    '50s': '50s & 60s',
    '60s': '50s & 60s',
    '70s': '70s',
    '80s': '80s',
    '90s': '90s',
    '00s': '2000s',
}


def map_genres_to_categories(genre_str):
    """Map pipe-separated genres to broad categories."""
    if not genre_str:
        return ''
    
    genres = [g.strip().lower() for g in genre_str.split('|')]
    categories = set()
    
    for genre in genres:
        if genre in TAG_TO_CATEGORY:
            categories.add(TAG_TO_CATEGORY[genre])
    
    return '|'.join(sorted(categories))


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

        total += 1
        categories = map_genres_to_categories(lastfm_genres)

        if categories:
            found += 1

        results.append((idx, name, url, lastfm_genres, categories))

    # Write full CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        f.write(',NAME,PUBLIC STREAM,GENRES,CATEGORY\n')
        f.write(',,,,\n')
        for idx, name, url, genres, category in results:
            if ',' in name:
                name = f'"{name}"'
            f.write(f'{idx},{name},{url},{genres},{category}\n')

    # Print summary of categories
    cat_counts = {}
    for _, _, _, _, cats in results:
        for c in cats.split('|'):
            if c:
                cat_counts[c] = cat_counts.get(c, 0) + 1
    
    print(f"Done! {found}/{total} stations mapped to categories.\n")
    print("Category distribution:")
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")
    
    print(f"\nOutput written to {output_file}")


if __name__ == '__main__':
    main()
