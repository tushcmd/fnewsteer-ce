# FNEWSTEER Extension — Chrome Extension

![Version](https://img.shields.io/badge/version-1.0.0-blue)
News loss-prevention signal directly inside TradingView. Auto-detects the current pair,
shows a draggable CLEAR/BLOCKED badge on the chart, and fires desktop warnings before blackouts.

---

## Install (Development / Unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `fnewsteer-extension/` folder
5. The FNEWSTEER icon appears in your Chrome toolbar

---

## First-time Setup

1. Click the extension icon → click ⚙ (settings)
2. Set your **API URL** — the address of your running FNEWSTEER FastAPI backend
3. Set your **API Key** — must match `FNEWSTEER_API_KEY` in the FastAPI `.env`
4. Click **TEST CONNECTION** to verify
5. Click **SAVE SETTINGS**

The extension will start polling immediately and the icon badge will turn green/amber.

---

## Features

### Auto-detect TradingView Pair

Open any chart on `tradingview.com`. The extension reads `document.title` via a
`MutationObserver` — when you switch charts the pair updates automatically, no interaction needed.

### Floating Badge (TradingView)

A draggable badge appears on every TradingView page:

- **CLEAR** (green pulse) — safe to trade
- **BLOCKED** (amber pulse) — news blackout active, shows countdown to clear
- Drag it anywhere on the screen so it doesn't obscure your chart

### Extension Icon Badge

The toolbar icon shows a colored badge at all times:

- 🟢 `●` — safe to trade
- 🟠 `!` — blackout active
- ⚫ `?` — connecting or API offline

### Desktop Notifications

Fires a browser notification N minutes before each blackout window opens.
N is configurable in Settings (default: 5 minutes).
Test with the **TEST NOTIFICATION** button in Settings.

### Popup

Click the icon to open the popup:

- Full CLEAR/BLOCKED signal with countdown ticker
- Quick-select buttons for 8 major pairs
- Custom pair input
- Multi-pair watchlist — add pairs to monitor all at once

### Watchlist

Add up to any number of pairs to the watchlist. The background worker
checks all of them on every 30-second poll and shows CLEAR/BLOCKED per pair in the popup.

### Settings

- API URL + Key (with show/hide toggle)
- Blackout window override (minutes) — overrides smart defaults
- Include Medium impact toggle
- Notification warning lead time (configurable minutes)

---

## Architecture

```
manifest.json         Permissions, entry points (MV3)
background.js         Service worker: polling, notifications, icon badge, state
content.js            TradingView: pair detection + floating badge
popup/
  popup.html/css/js   Main popup UI
settings/
  settings.html/css/js  Settings page
icons/
  icon-{16,48,128}.png  Extension icons (replace with your own design)
```

### Message protocol

| Direction            | Message type       | Payload           |
| -------------------- | ------------------ | ----------------- |
| content → background | `TV_PAIR_DETECTED` | `{ pair }`        |
| popup → background   | `SET_PAIR`         | `{ pair }`        |
| popup → background   | `GET_STATE`        | —                 |
| popup → background   | `UPDATE_WATCHLIST` | `{ pairs }`       |
| popup → background   | `FORCE_POLL`       | —                 |
| background → all     | `FNEWSTEER_STATE`  | full state object |

### Polling

- Chrome `alarms` API fires every 30 seconds
- On each alarm: check primary pair, check watchlist pairs, check notification thresholds
- State stored in `chrome.storage.session` for fast popup reads

---

## Releases

See [GitHub Releases](https://github.com/tushcmd/fnewsteer-ce/releases) to download a packaged version.

### v1.0.0 — Initial Release

- First public release
- All core features: auto-detect pair, floating badge, watchlist, desktop notifications, settings

### Install (Developer Mode)

1. Download `fnewsteer-v1.0.0.zip` and unzip it
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the unzipped folder

## Related

- [FNEWSTEER API](https://github.com/tushcmd/fnewsteer)
