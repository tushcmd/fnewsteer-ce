// background.js — FNEWSTEER Service Worker
// Owns: API polling, icon badge, desktop notifications, state broadcasting

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_ALARM = 'fnewsteer-poll';
const POLL_INTERVAL = 0.5; // minutes (30 seconds)
const DEFAULT_SETTINGS = {
  apiUrl: 'http://localhost:8000',
  apiKey: '',
  windowMinutes: null,
  includeMedium: false,
  notifyMinutes: 5, // minutes before blackout to notify
};

// ─── State ────────────────────────────────────────────────────────────────────
// Persisted in chrome.storage.session (cleared on browser restart, fast)
let state = {
  currentPair: 'EURUSD',
  checkResult: null, // last /news/check response
  upcomingEvents: [], // from /news/upcoming for current pair
  watchlist: [], // array of { pair, checkResult }
  lastFetch: null,
  apiOnline: null,
  firedNotifs: {}, // { eventKey: true } — dedup guard
};

// ─── Settings helpers ─────────────────────────────────────────────────────────
async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function apiFetch(path, params = {}) {
  const settings = await getSettings();
  if (!settings.apiUrl) throw new Error('API URL not configured');

  const url = new URL(path, settings.apiUrl);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': settings.apiKey },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function checkPair(pair, settings) {
  return apiFetch('/news/check', {
    symbol: pair,
    include_medium: settings.includeMedium || undefined,
    window_minutes: settings.windowMinutes || undefined,
  });
}

async function fetchUpcoming(pair, settings) {
  return apiFetch('/news/upcoming', {
    currency: pair,
    include_medium: settings.includeMedium || undefined,
    window_minutes: settings.windowMinutes || undefined,
  });
}

// ─── Icon badge ───────────────────────────────────────────────────────────────
function updateBadge(safe, apiOnline) {
  if (apiOnline === false) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b6b7a' });
    chrome.action.setTitle({ title: 'FNEWSTEER — API Offline' });
    return;
  }
  if (safe === null) {
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#2a2a30' });
    return;
  }
  if (safe) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    chrome.action.setTitle({
      title: `FNEWSTEER — CLEAR (${state.currentPair})`,
    });
  } else {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setTitle({
      title: `FNEWSTEER — BLOCKED (${state.currentPair})`,
    });
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function checkAndFireNotifications(events) {
  const settings = await getSettings();
  const warnMins = settings.notifyMinutes ?? 5;
  const now = Date.now();

  for (const event of events) {
    const windowStart = new Date(event.window_start).getTime();
    const minsToWindow = (windowStart - now) / 60000;

    // Already in blackout — don't notify
    if (minsToWindow < 0) continue;

    // Within the warning window
    if (minsToWindow <= warnMins) {
      const key = `${event.title}__${event.event_time}`;
      if (state.firedNotifs[key]) continue; // already fired

      state.firedNotifs[key] = true;
      const minsRounded = Math.round(minsToWindow);

      chrome.notifications.create(`fnewsteer-${Date.now()}`, {
        type: 'basic',
        iconUrl: '../icons/icon-48.png',
        title: `⚠ FNEWSTEER — Blackout in ${minsRounded}m`,
        message: `${event.title} (${event.currency}) · ${event.impact} Impact\nWindow opens in ~${minsRounded} minute${minsRounded !== 1 ? 's' : ''}`,
        priority: 2,
      });
    }
  }

  // Clean up old fired notifs to prevent memory growth
  const cutoff = now - 4 * 60 * 60 * 1000; // 4 hours ago
  for (const key of Object.keys(state.firedNotifs)) {
    const parts = key.split('__');
    const eventTs = parts[1] ? new Date(parts[1]).getTime() : 0;
    if (eventTs && eventTs < cutoff) delete state.firedNotifs[key];
  }
}

// ─── Broadcast to content scripts & popup ────────────────────────────────────
async function broadcastState() {
  const msg = {
    type: 'FNEWSTEER_STATE',
    currentPair: state.currentPair,
    checkResult: state.checkResult,
    upcomingEvents: state.upcomingEvents,
    watchlist: state.watchlist,
    lastFetch: state.lastFetch,
    apiOnline: state.apiOnline,
  };

  // Broadcast to all TradingView tabs
  const tabs = await chrome.tabs.query({
    url: 'https://www.tradingview.com/*',
  });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {
      /* tab may not have content script */
    });
  }

  // Store in session storage for popup to read on open
  await chrome.storage.session.set({ fnewsteerState: msg });
}

// ─── Main poll ────────────────────────────────────────────────────────────────
async function poll() {
  const settings = await getSettings();

  try {
    // Check primary pair
    const result = await checkPair(state.currentPair, settings);
    state.checkResult = result;
    state.apiOnline = true;
    state.lastFetch = new Date().toISOString();

    // Fetch upcoming for notifications
    try {
      const upcoming = await fetchUpcoming(state.currentPair, settings);
      state.upcomingEvents = upcoming.events ?? [];
      await checkAndFireNotifications(state.upcomingEvents);
    } catch {
      /* non-fatal */
    }

    // Check watchlist pairs
    const watchlistResults = [];
    for (const pair of getWatchlistPairs()) {
      try {
        const wResult = await checkPair(pair, settings);
        watchlistResults.push({ pair, checkResult: wResult });
      } catch {
        watchlistResults.push({ pair, checkResult: null });
      }
    }
    state.watchlist = watchlistResults;

    updateBadge(result.safe_to_trade, true);
  } catch (err) {
    state.apiOnline = false;
    state.checkResult = null;
    updateBadge(null, false);
    console.warn('[FNEWSTEER] Poll failed:', err.message);
  }

  await broadcastState();
}

// ─── Watchlist storage ────────────────────────────────────────────────────────
function getWatchlistPairs() {
  // Stored separately in sync storage, loaded fresh each poll
  return state._watchlistPairs ?? [];
}

async function loadWatchlistPairs() {
  const { watchlistPairs = [] } =
    await chrome.storage.sync.get('watchlistPairs');
  state._watchlistPairs = watchlistPairs;
}

// ─── Message handling ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'TV_PAIR_DETECTED':
      // TradingView content script detected a new pair
      if (msg.pair && msg.pair !== state.currentPair) {
        state.currentPair = msg.pair;
        poll(); // immediate re-check on pair change
      }
      sendResponse({ ok: true });
      break;

    case 'SET_PAIR':
      // Manual override from popup
      state.currentPair = msg.pair.toUpperCase();
      poll();
      sendResponse({ ok: true });
      break;

    case 'GET_STATE':
      sendResponse({
        currentPair: state.currentPair,
        checkResult: state.checkResult,
        upcomingEvents: state.upcomingEvents,
        watchlist: state.watchlist,
        lastFetch: state.lastFetch,
        apiOnline: state.apiOnline,
      });
      break;

    case 'UPDATE_WATCHLIST':
      state._watchlistPairs = msg.pairs;
      chrome.storage.sync.set({ watchlistPairs: msg.pairs });
      poll();
      sendResponse({ ok: true });
      break;

    case 'FORCE_POLL':
      poll();
      sendResponse({ ok: true });
      break;
  }
  return true; // keep message channel open for async
});

// ─── Alarm (polling heartbeat) ────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadWatchlistPairs();

  // Register polling alarm
  await chrome.alarms.clearAll();
  chrome.alarms.create(POLL_ALARM, {
    delayInMinutes: POLL_INTERVAL,
    periodInMinutes: POLL_INTERVAL,
  });

  // Initial poll
  await poll();
}

init();
