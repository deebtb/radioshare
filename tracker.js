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

function trackPlay(station, page) {
    try {
        navigator.sendBeacon(TRACKER_URL, JSON.stringify({
            station: station,
            page: page,
            action: 'play'
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
            action: 'stop'
        }));
    } catch (e) {
        // Silent fail
    }
}
