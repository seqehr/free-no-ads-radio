# Open Dial — free radio, no ads

A tiny web radio player for phones and desktops. Thousands of live stations from every country, with no ads, no account and no tracking.

**Use it:** https://seqehr.github.io/free-no-ads-radio/

## Features
- Pick any country (with station counts) or browse all countries
- Search by station name, filter by genre
- Favorites and last station, saved on your device
- Sleep timer
- Lock-screen / Control Center controls (Media Session API)

## Install on iPhone
Open the link in Safari → Share → **Add to Home Screen**. It opens full-screen like an app.

## How it works
One static `index.html`, no build step. Station data comes from the free, community-run [Radio Browser](https://www.radio-browser.info) API. Only HTTPS streams are listed, because browsers block plain-HTTP audio on HTTPS pages.

Ads that a station broadcasts on air can't be removed — the app itself shows none.

## License
MIT
