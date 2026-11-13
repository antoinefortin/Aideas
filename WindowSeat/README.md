# Window Seat

A mobile-first, fully offline flight website for curious passengers. No native app or install required.

## Before boarding

1. Open the HTTPS website in Android Chrome while online.
2. Wait for **Saved for offline**, then bookmark that exact URL.
3. Turn on airplane mode, turn off Wi-Fi, and reload the bookmark to verify it opens.
4. Keep Android Location enabled. Allow website location and wait for reception near a window.
5. Record with the page visible. Stop and export your log before clearing browser storage.

## Features

- Browser-reported location, GPS altitude with uncertainty, ground speed, travel track and freshness.
- Derived vertical trend and distance, with gap, accuracy, and jump filtering.
- Bundled public-domain Natural Earth coastlines; pan, pinch, zoom, and recorded trail.
- Offline airport/custom-coordinate route setup, remaining great-circle distance and rough ETA.
- Optional phone compass, tilt, acceleration, rotation, battery status, and screen wake lock.
- IndexedDB flight logs, notes, explicit background gaps, and JSON / CSV / GPX exports.
- Clearly labeled demo, nautical/metric units, offline file verification, and retention request.

## Offline design

All runtime files are local. There are no remote fonts, tiles, libraries, analytics, accounts, uploads, or flight-data APIs. The service worker precaches seven files and responds from cache only; unknown URLs return 503 instead of reaching the network. It is scoped to this folder, leaving other repository projects untouched. The browser itself controls its location provider and service-worker update checks; this site cannot control operating-system traffic. For physical disconnection, use airplane mode with Wi-Fi off.

The first visit must use HTTPS (or localhost in development). A `file://` URL cannot prepare the offline service worker. No build step. Serve this folder using a static server. For GitHub Pages, the intended URL is `https://antoinefortin.github.io/Aideas/WindowSeat/`.

## Honest limits

Reception inside an aircraft is not guaranteed. Fields may be missing. This website cannot force satellite-only location. It cannot read cabin pressure, temperature, satellite count, aircraft airspeed or ADS-B data. Phone readings do not describe aircraft attitude. GPS altitude is not flight level. Background/locked-screen recording is not guaranteed by browsers. Browsers can evict data, so export important logs. Intended only for passenger interest, never aviation navigation.

## Data

Exports use SI units regardless of display settings; JSON includes the field units. Fix and sensor timestamps are Unix milliseconds. Sensor samples are recorded at most once a second; fixes at most about once a second. Orientation and motion sample times are retained separately. Samples are saved in batches and every five seconds while recording; abrupt termination may lose the last uncommitted samples. A session is capped at 50,000 combined samples. Interrupted sessions remain exportable from Saved Flights. No raw sensor values are fabricated when unavailable.

Distance sums consecutive position fixes within 30 seconds, each with horizontal accuracy no worse than 100 m, rejecting implied speeds above 400 m/s. Vertical trend requires 10–30 seconds between adequate-altitude-accuracy fixes. These estimates can still be noisy.

## Verification

Run `node --test tests/*.test.cjs`. Calculation tests cover missing fields, zero values, great-circle distance, GPS jumps, gaps, vertical trend, dateline wrapping, and CSV escaping. Worker tests verify bundled files, offline responses, cache validation, and no network fallback.

The local browser was successfully reloaded with its preview server stopped, including the offline map and persisted route. Actual Android sensor reception and long-flight recording require real-device validation.

Map: [Natural Earth, public domain](https://www.naturalearthdata.com/about/terms-of-use/). Sensor reference links are included in the website field guide.
