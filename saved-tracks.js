/**
 * Saved Tracks — shared localStorage logic for bookmarking now-playing songs.
 *
 * Storage key: 'savedTracks'
 * Format: JSON array of { station, artist, title, timestamp }
 * Timestamp: ISO-8601 UTC with second precision (e.g. 2026-08-01T13:42:01Z)
 */

const SAVED_TRACKS_KEY = 'savedTracks';
const SAVE_EMOJIS = ['♥️', '🍻', '🎉', '🍾', '🍪', '🔥', '😍', '🤩', '🎶', '✨'];

function getSavedTracks() {
    try {
        return JSON.parse(localStorage.getItem(SAVED_TRACKS_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveTrack(station, artist, title) {
    const tracks = getSavedTracks();
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    tracks.unshift({ station, artist, title, timestamp });
    localStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(tracks));
    return tracks;
}

function removeTrack(index) {
    const tracks = getSavedTracks();
    if (index >= 0 && index < tracks.length) {
        tracks.splice(index, 1);
        localStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(tracks));
    }
    return tracks;
}

function exportTracksCSV() {
    const tracks = getSavedTracks();
    const header = 'Station,Artist,Title,Timestamp';
    const rows = tracks.map(t =>
        `"${csvEscape(t.station)}","${csvEscape(t.artist)}","${csvEscape(t.title)}","${t.timestamp}"`
    );
    return header + '\n' + rows.join('\n');
}

function csvEscape(str) {
    if (!str) return '';
    return str.replace(/"/g, '""');
}

function randomSaveEmoji() {
    return SAVE_EMOJIS[Math.floor(Math.random() * SAVE_EMOJIS.length)];
}

/**
 * Parse a now-playing string into artist and title.
 * Handles formats like "Artist - Title" or just "Title".
 */
function parseTrackString(trackStr) {
    if (!trackStr) return { artist: '', title: '' };
    const str = trackStr.trim();
    if (str.includes(' - ')) {
        const parts = str.split(' - ');
        return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    }
    return { artist: '', title: str };
}

/**
 * Show a save toast on the page. Expects a #save-toast element to exist.
 * If it doesn't exist, creates one.
 */
function showSaveToast() {
    let toast = document.getElementById('save-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'save-toast';
        toast.style.cssText = 'position:fixed;bottom:5rem;left:50%;transform:translateX(-50%);background:#2d3748;color:#fff;padding:0.6rem 1.2rem;border-radius:8px;font-size:0.95rem;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:200;';
        document.body.appendChild(toast);
    }
    toast.textContent = `Saved ${randomSaveEmoji()}`;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
