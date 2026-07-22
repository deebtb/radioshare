/**
 * Play event tracker for deeradio.uk
 * Sends play/stop events to the Cloudflare Worker play-tracker.
 *
 * Usage: Include this script, then call:
 *   trackPlay(stationName, pageName)
 *   trackStop(stationName, pageName)
 */

// Change this to your play-tracker Worker URL
const TRACKER_URL = 'https://play-tracker.deebeyondthebar.workers.dev';

// Generate or retrieve a persistent anonymous visitor ID
function getVisitorId() {
    let id = localStorage.getItem('deeradio_visitor');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('deeradio_visitor', id);
    }
    return id;
}

function trackPlay(station, page) {
    try {
        navigator.sendBeacon(TRACKER_URL, JSON.stringify({
            station: station,
            page: page,
            action: 'play',
            visitor: getVisitorId()
        }));
    } catch (e) {
        // Silent fail — tracking should never break playback
    }
}

function trackStop(station, page) {
    try {
        navigator.sendBeacon(TRACKER_URL, JSON.stringify({
            station: station,
            page: page,
            action: 'stop',
            visitor: getVisitorId()
        }));
    } catch (e) {
        // Silent fail
    }
}
