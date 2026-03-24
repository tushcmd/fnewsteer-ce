// settings.js — FNEWSTEER Settings Page

const DEFAULT_SETTINGS = {
  apiUrl:        'http://localhost:8000',
  apiKey:        '',
  windowMinutes: '',
  includeMedium: false,
  notifyMinutes: 5,
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const form           = document.getElementById('settings-form')
const apiUrlInput    = document.getElementById('api-url')
const apiKeyInput    = document.getElementById('api-key')
const toggleKeyBtn   = document.getElementById('toggle-key')
const windowInput    = document.getElementById('window-minutes')
const mediumCheck    = document.getElementById('include-medium')
const notifyInput    = document.getElementById('notify-minutes')
const testBtn        = document.getElementById('test-btn')
const testResult     = document.getElementById('test-result')
const testNotifBtn   = document.getElementById('test-notif-btn')
const saveStatus     = document.getElementById('save-status')

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  apiUrlInput.value   = s.apiUrl        || ''
  apiKeyInput.value   = s.apiKey        || ''
  windowInput.value   = s.windowMinutes || ''
  mediumCheck.checked = s.includeMedium || false
  notifyInput.value   = s.notifyMinutes ?? 5
}

// ─── Save ─────────────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const settings = {
    apiUrl:        apiUrlInput.value.trim().replace(/\/$/, ''),
    apiKey:        apiKeyInput.value.trim(),
    windowMinutes: windowInput.value ? parseInt(windowInput.value) : null,
    includeMedium: mediumCheck.checked,
    notifyMinutes: notifyInput.value ? parseInt(notifyInput.value) : 5,
  }

  await chrome.storage.sync.set(settings)

  // Notify background to re-poll with new settings
  chrome.runtime.sendMessage({ type: 'FORCE_POLL' })

  saveStatus.style.display = 'inline'
  setTimeout(() => { saveStatus.style.display = 'none' }, 2500)
})

// ─── Show/hide API key ────────────────────────────────────────────────────────
toggleKeyBtn.addEventListener('click', () => {
  const show = apiKeyInput.type === 'password'
  apiKeyInput.type = show ? 'text' : 'password'
  toggleKeyBtn.textContent = show ? '🙈' : '👁'
})

// ─── Test connection ──────────────────────────────────────────────────────────
testBtn.addEventListener('click', async () => {
  testBtn.textContent = 'TESTING...'
  testBtn.disabled    = true
  testResult.style.display = 'none'

  const url = apiUrlInput.value.trim().replace(/\/$/, '') || 'http://localhost:8000'
  const key = apiKeyInput.value.trim()

  try {
    const res = await fetch(`${url}/health`, {
      headers: { 'X-API-Key': key },
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()

    if (data.status === 'ok') {
      showTestResult('success',
        `✓ Connected · Cache age: ${data.cache_age_seconds != null
          ? Math.round(data.cache_age_seconds) + 's'
          : 'not yet populated'}`
      )
    } else {
      showTestResult('error', `API returned status: ${data.status}`)
    }
  } catch (err) {
    showTestResult('error', `Connection failed: ${err.message}`)
  } finally {
    testBtn.textContent = 'TEST CONNECTION'
    testBtn.disabled    = false
  }
})

function showTestResult(type, msg) {
  testResult.className     = `test-result ${type}`
  testResult.textContent   = msg
  testResult.style.display = 'block'
}

// ─── Test notification ────────────────────────────────────────────────────────
testNotifBtn.addEventListener('click', () => {
  chrome.notifications.create(`fnewsteer-test-${Date.now()}`, {
    type:     'basic',
    iconUrl:  '../icons/icon-48.png',
    title:    '⚠ FNEWSTEER — Test Notification',
    message:  'Non-Farm Payrolls (USD) · High Impact\nWindow opens in ~5 minutes',
    priority: 2,
  })
})

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings()
