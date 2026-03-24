// content.js — injected into TradingView tabs
// Owns: pair detection via MutationObserver, floating badge UI

// ─── Pair extraction ──────────────────────────────────────────────────────────
function extractPairFromTitle(title) {
  // TradingView title formats:
  // "EURUSD · 1.0842 · TradingView"
  // "NASDAQ:AAPL · 182.50 · TradingView"
  // "BINANCE:BTCUSDT · 67,420 · TradingView"
  if (!title) return null;

  const part = title.split('·')[0].trim();
  if (!part) return null;

  // Strip exchange prefix (NASDAQ:AAPL → AAPL, BINANCE:BTCUSDT → BTCUSDT)
  const symbol = part.includes(':') ? part.split(':')[1] : part;

  // Basic sanity — must be 3–10 alphanumeric chars
  if (/^[A-Z0-9]{3,10}$/.test(symbol)) return symbol;
  return null;
}

// ─── State ────────────────────────────────────────────────────────────────────
let currentPair = null;
let latestState = null;
let badgeEl = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// ─── Send pair to background ──────────────────────────────────────────────────
function reportPair(pair) {
  if (pair === currentPair) return;
  currentPair = pair;
  chrome.runtime.sendMessage({ type: 'TV_PAIR_DETECTED', pair });
}

// ─── Watch document.title ─────────────────────────────────────────────────────
const titleObserver = new MutationObserver(() => {
  const pair = extractPairFromTitle(document.title);
  if (pair) reportPair(pair);
});

titleObserver.observe(document.querySelector('title') || document.head, {
  subtree: true,
  childList: true,
  characterData: true,
});

// Initial read
const initialPair = extractPairFromTitle(document.title);
if (initialPair) reportPair(initialPair);

// ─── Floating badge ───────────────────────────────────────────────────────────
function createBadge() {
  if (badgeEl) return;

  badgeEl = document.createElement('div');
  badgeEl.id = 'fnewsteer-badge';
  badgeEl.innerHTML = `
    <div id="fns-inner">
      <div id="fns-dot"></div>
      <div id="fns-content">
        <div id="fns-status">CONNECTING</div>
        <div id="fns-pair">—</div>
        <div id="fns-countdown"></div>
      </div>
      <div id="fns-drag-handle" title="Drag to move">⠿</div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #fnewsteer-badge {
      position: fixed;
      bottom: 56px;
      right: 16px;
      z-index: 9999999;
      user-select: none;
      cursor: default;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    #fns-inner {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(10, 10, 11, 0.92);
      border: 1px solid #1e1e22;
      border-radius: 6px;
      padding: 7px 10px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      transition: border-color 0.3s, box-shadow 0.3s;
      min-width: 130px;
    }
    #fns-inner.safe {
      border-color: rgba(34,197,94,0.35);
      box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 12px rgba(34,197,94,0.1);
    }
    #fns-inner.blocked {
      border-color: rgba(245,158,11,0.35);
      box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 12px rgba(245,158,11,0.12);
    }
    #fns-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #6b6b7a;
      flex-shrink: 0;
      transition: background 0.3s;
    }
    #fns-inner.safe    #fns-dot { background: #22c55e; animation: fns-pulse-safe 2s infinite; }
    #fns-inner.blocked #fns-dot { background: #f59e0b; animation: fns-pulse-warn 1.5s infinite; }
    #fns-content { flex: 1; min-width: 0; }
    #fns-status {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #e8e8ed;
      line-height: 1;
    }
    #fns-inner.safe    #fns-status { color: #22c55e; }
    #fns-inner.blocked #fns-status { color: #f59e0b; }
    #fns-pair {
      font-size: 9px;
      color: #6b6b7a;
      letter-spacing: 0.05em;
      margin-top: 2px;
    }
    #fns-countdown {
      font-size: 9px;
      color: #6b6b7a;
      margin-top: 1px;
      letter-spacing: 0.03em;
    }
    #fns-drag-handle {
      font-size: 12px;
      color: #2a2a30;
      cursor: grab;
      flex-shrink: 0;
      line-height: 1;
      padding-left: 2px;
      transition: color 0.15s;
    }
    #fns-drag-handle:hover { color: #6b6b7a; }
    #fns-drag-handle:active { cursor: grabbing; }
    @keyframes fns-pulse-safe {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
      50%      { box-shadow: 0 0 0 4px rgba(34,197,94,0.25); }
    }
    @keyframes fns-pulse-warn {
      0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
      50%      { box-shadow: 0 0 0 4px rgba(245,158,11,0.3); }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(badgeEl);

  // ── Drag logic ──
  const handle = badgeEl.querySelector('#fns-drag-handle');

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;

    const rect = badgeEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    // Switch to absolute positioning when dragging
    badgeEl.style.bottom = 'auto';
    badgeEl.style.right = 'auto';
    badgeEl.style.left = rect.left + 'px';
    badgeEl.style.top = rect.top + 'px';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    // Clamp inside viewport
    const maxX = window.innerWidth - badgeEl.offsetWidth - 4;
    const maxY = window.innerHeight - badgeEl.offsetHeight - 4;
    badgeEl.style.left = Math.max(4, Math.min(x, maxX)) + 'px';
    badgeEl.style.top = Math.max(4, Math.min(y, maxY)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function updateBadge(state) {
  if (!badgeEl) return;
  const inner = badgeEl.querySelector('#fns-inner');
  const statusEl = badgeEl.querySelector('#fns-status');
  const pairEl = badgeEl.querySelector('#fns-pair');
  const countdown = badgeEl.querySelector('#fns-countdown');

  if (!state || state.apiOnline === false) {
    inner.className = '';
    statusEl.textContent = 'OFFLINE';
    pairEl.textContent = 'API unreachable';
    countdown.textContent = '';
    return;
  }

  const result = state.checkResult;
  if (!result) {
    inner.className = '';
    statusEl.textContent = 'LOADING';
    pairEl.textContent = state.currentPair || '—';
    countdown.textContent = '';
    return;
  }

  inner.className = result.safe_to_trade ? 'safe' : 'blocked';
  statusEl.textContent = result.safe_to_trade ? 'CLEAR' : 'BLOCKED';
  pairEl.textContent = state.currentPair;

  // Countdown
  const blocking = result.blocking_events?.[0];
  if (!result.safe_to_trade && blocking) {
    const secsLeft = Math.max(
      0,
      Math.round((new Date(blocking.window_end).getTime() - Date.now()) / 1000),
    );
    const m = Math.floor(secsLeft / 60);
    const s = secsLeft % 60;
    countdown.textContent = `clears in ${m}:${String(s).padStart(2, '0')}`;
  } else {
    // Time to next blackout
    const upcoming = state.upcomingEvents ?? [];
    const next = upcoming
      .filter((e) => new Date(e.window_start) > new Date())
      .sort((a, b) => new Date(a.window_start) - new Date(b.window_start))[0];
    if (next) {
      const minsTo = Math.round(
        (new Date(next.window_start) - Date.now()) / 60000,
      );
      countdown.textContent =
        minsTo < 60
          ? `next in ${minsTo}m`
          : `next in ${Math.floor(minsTo / 60)}h${minsTo % 60 > 0 ? ` ${minsTo % 60}m` : ''}`;
    } else {
      countdown.textContent = 'no events this week';
    }
  }
}

// ─── Countdown tick ───────────────────────────────────────────────────────────
setInterval(() => {
  if (latestState) updateBadge(latestState);
}, 1000);

// ─── Listen for background state broadcasts ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FNEWSTEER_STATE') {
    latestState = msg;
    updateBadge(msg);
  }
});

// ─── Init badge once DOM is ready ─────────────────────────────────────────────
if (document.body) {
  createBadge();
} else {
  document.addEventListener('DOMContentLoaded', createBadge);
}
