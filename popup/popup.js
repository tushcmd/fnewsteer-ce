// popup.js — FNEWSTEER Popup

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const apiDot        = document.getElementById('api-status')
const refreshBtn    = document.getElementById('refresh-btn')
const pairInput     = document.getElementById('pair-input')
const pairSetBtn    = document.getElementById('pair-set-btn')
const quickPairs    = document.querySelectorAll('.qp')
const tvDetected    = document.getElementById('tv-detected')
const signalSection = document.getElementById('signal-section')
const signalIcon    = document.getElementById('signal-icon')
const signalText    = document.getElementById('signal-text')
const signalSub     = document.getElementById('signal-sub')
const signalCountdown = document.getElementById('signal-countdown')
const blockingDetail  = document.getElementById('blocking-detail')
const blockingTitle   = document.getElementById('blocking-title')
const bCcy    = document.getElementById('b-ccy')
const bImpact = document.getElementById('b-impact')
const bTime   = document.getElementById('b-time')
const bWindow = document.getElementById('b-window')
const lastUpdate      = document.getElementById('last-update')
const watchlistItems  = document.getElementById('watchlist-items')
const watchlistEmpty  = document.getElementById('watchlist-empty')
const addWatchlistBtn = document.getElementById('add-watchlist-btn')
const watchlistAddRow = document.getElementById('watchlist-add-row')
const wlInput         = document.getElementById('wl-input')
const wlConfirmBtn    = document.getElementById('wl-confirm-btn')

// ─── Watchlist state ──────────────────────────────────────────────────────────
let watchlistPairs = []

async function loadWatchlistPairs() {
  const { watchlistPairs: stored = [] } = await chrome.storage.sync.get('watchlistPairs')
  watchlistPairs = stored
}

async function saveWatchlistPairs() {
  await chrome.storage.sync.set({ watchlistPairs })
  chrome.runtime.sendMessage({ type: 'UPDATE_WATCHLIST', pairs: watchlistPairs })
}

// ─── Render ───────────────────────────────────────────────────────────────────
let countdownInterval = null

function renderState(state) {
  if (!state) return

  // API dot
  apiDot.className = 'api-dot ' + (state.apiOnline === false ? 'offline' : state.apiOnline === true ? 'online' : '')

  // Active pair in input / quick pairs
  const activePair = state.currentPair || 'EURUSD'
  pairInput.placeholder = activePair
  quickPairs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pair === activePair)
  })

  // TV detected notice — check if any TV tab matches
  tvDetected.style.display = 'none'
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (tab?.url?.includes('tradingview.com')) {
      tvDetected.style.display = 'block'
    }
  })

  // Signal
  const result = state.checkResult
  if (!result) {
    signalSection.className = 'section signal-box'
    signalIcon.textContent  = '◌'
    signalText.textContent  = state.apiOnline === false ? 'OFFLINE' : 'LOADING...'
    signalSub.textContent   = state.apiOnline === false ? 'Check settings' : ''
    signalCountdown.textContent = ''
    blockingDetail.style.display = 'none'
    return
  }

  const safe = result.safe_to_trade
  signalSection.className = 'section signal-box ' + (safe ? 'safe' : 'blocked')
  signalIcon.textContent  = safe ? '◉' : '◈'
  signalText.textContent  = safe ? 'CLEAR' : 'BLOCKED'
  signalSub.textContent   = `${activePair} · SAFE TO ${safe ? 'TRADE' : 'AVOID'}`

  // Countdown ticker
  clearInterval(countdownInterval)
  countdownInterval = setInterval(() => updateCountdown(state), 1000)
  updateCountdown(state)

  // Blocking detail
  const blocking = result.blocking_events?.[0]
  if (!safe && blocking) {
    blockingDetail.style.display = 'block'
    blockingTitle.textContent = blocking.title
    bCcy.textContent    = blocking.currency
    bImpact.textContent = blocking.impact.toUpperCase()

    const eventDate = new Date(blocking.event_time)
    bTime.textContent = eventDate.toUTCString().slice(17, 22) + ' UTC'

    const ws = new Date(blocking.window_start)
    const we = new Date(blocking.window_end)
    bWindow.textContent = `${ws.toUTCString().slice(17,22)}–${we.toUTCString().slice(17,22)}`
  } else {
    blockingDetail.style.display = 'none'
  }

  // Last update
  if (state.lastFetch) {
    const d = new Date(state.lastFetch)
    lastUpdate.textContent = d.toUTCString().slice(17, 25) + ' UTC'
  }

  // Watchlist
  renderWatchlist(state.watchlist ?? [])
}

function updateCountdown(state) {
  const result = state?.checkResult
  if (!result) return

  if (!result.safe_to_trade) {
    const blocking = result.blocking_events?.[0]
    if (blocking) {
      const secsLeft = Math.max(0, Math.round(
        (new Date(blocking.window_end) - Date.now()) / 1000
      ))
      const m = Math.floor(secsLeft / 60)
      const s = secsLeft % 60
      signalCountdown.textContent = `clears in ${m}:${String(s).padStart(2,'0')}`
    }
  } else {
    const upcoming = state.upcomingEvents ?? []
    const next = upcoming
      .filter(e => new Date(e.window_start) > new Date())
      .sort((a, b) => new Date(a.window_start) - new Date(b.window_start))[0]
    if (next) {
      const minsTo = Math.round((new Date(next.window_start) - Date.now()) / 60000)
      if (minsTo < 60) {
        signalCountdown.textContent = `next blackout in ${minsTo}m`
      } else {
        signalCountdown.textContent = `next in ${Math.floor(minsTo/60)}h ${minsTo%60}m`
      }
    } else {
      signalCountdown.textContent = 'no events this week'
    }
  }
}

function renderWatchlist(watchlist) {
  watchlistItems.innerHTML = ''

  if (watchlistPairs.length === 0) {
    watchlistEmpty.style.display = 'block'
    return
  }
  watchlistEmpty.style.display = 'none'

  for (const pair of watchlistPairs) {
    const entry   = watchlist.find(w => w.pair === pair)
    const result  = entry?.checkResult
    const safe    = result?.safe_to_trade
    const cls     = safe === true ? 'safe' : safe === false ? 'blocked' : 'unknown'
    const label   = safe === true ? 'CLEAR' : safe === false ? 'BLOCKED' : '—'

    const item = document.createElement('div')
    item.className = `watchlist-item ${cls}`
    item.innerHTML = `
      <span class="wl-pair">${pair}</span>
      <span class="wl-signal ${cls}">${label}</span>
      <button class="wl-remove" data-pair="${pair}" title="Remove">×</button>
    `
    item.querySelector('.wl-remove').addEventListener('click', async (e) => {
      const p = e.currentTarget.dataset.pair
      watchlistPairs = watchlistPairs.filter(x => x !== p)
      await saveWatchlistPairs()
      item.remove()
      if (watchlistPairs.length === 0) watchlistEmpty.style.display = 'block'
    })
    watchlistItems.appendChild(item)
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────
function setPair(pair) {
  const clean = pair.trim().toUpperCase()
  if (!clean || clean.length < 3) return
  chrome.runtime.sendMessage({ type: 'SET_PAIR', pair: clean })
  // Optimistic UI
  pairInput.value = ''
  pairInput.placeholder = clean
  quickPairs.forEach(btn => btn.classList.toggle('active', btn.dataset.pair === clean))
}

pairSetBtn.addEventListener('click', () => setPair(pairInput.value || pairInput.placeholder))
pairInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') setPair(pairInput.value)
})
quickPairs.forEach(btn => {
  btn.addEventListener('click', () => setPair(btn.dataset.pair))
})

refreshBtn.addEventListener('click', () => {
  refreshBtn.style.opacity = '0.4'
  chrome.runtime.sendMessage({ type: 'FORCE_POLL' }, () => {
    setTimeout(() => { refreshBtn.style.opacity = '1' }, 600)
  })
})

// Watchlist add
addWatchlistBtn.addEventListener('click', () => {
  const shown = watchlistAddRow.style.display !== 'none'
  watchlistAddRow.style.display = shown ? 'none' : 'flex'
  if (!shown) wlInput.focus()
})

async function addToWatchlist() {
  const pair = wlInput.value.trim().toUpperCase()
  if (!pair || pair.length < 3) return
  if (!watchlistPairs.includes(pair)) {
    watchlistPairs.push(pair)
    await saveWatchlistPairs()
  }
  wlInput.value = ''
  watchlistAddRow.style.display = 'none'
}

wlConfirmBtn.addEventListener('click', addToWatchlist)
wlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addToWatchlist() })

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadWatchlistPairs()

  // Get state from background
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (state) renderState(state)
  })

  // Also check session storage (faster on first open)
  chrome.storage.session.get('fnewsteerState', ({ fnewsteerState }) => {
    if (fnewsteerState) renderState(fnewsteerState)
  })
}

// Live updates while popup is open
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FNEWSTEER_STATE') renderState(msg)
})

init()
