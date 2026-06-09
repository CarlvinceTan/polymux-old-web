// 5s polling was leftover from early development. With useOnReconnect already
// wired into every page that fetches data (which retries on the available
// transition), the foreground check just needs to be frequent enough that the
// "Server unavailable" overlay doesn't linger after the backend recovers.
const POLL_INTERVAL = 30_000
const FETCH_TIMEOUT = 5_000

const _available = ref(true)
let _timer: ReturnType<typeof setInterval> | null = null
let _initialized = false

function _healthUrl() {
  // Same-origin Nitro health route checks the Go backend via serverUrl.
  return '/api/health'
}

async function _check() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  const wasAvailable = _available.value
  let connected = false
  try {
    const res = await fetch(_healthUrl(), { signal: controller.signal })
    connected = res.ok
    _available.value = connected
  }
  catch {
    _available.value = false
  }
  finally {
    clearTimeout(timeout)
  }
  // Only log the edge — steady-state polling shouldn't flood the console.
  if (wasAvailable !== _available.value) {
    console.info('[health]', connected ? 'connected' : 'unavailable')
  }
}

function _stopPolling() {
  if (_timer !== null) {
    clearInterval(_timer)
    _timer = null
  }
}

function _startPolling() {
  _stopPolling()
  _timer = setInterval(_check, POLL_INTERVAL)
}

function _onVisibilityChange() {
  if (document.hidden) {
    _stopPolling()
  }
  else {
    _check()
    _startPolling()
  }
}

// Singleton initialization — first call from a Nuxt context wires up polling
// and the visibility listener, and they live for the rest of the app session.
// Per-component `onMounted`/`onUnmounted` hooks would let any single consumer
// kill polling for everyone else when it unmounted, which broke reconnect
// detection once `useOnReconnect` started spreading the call to many pages.
function _initialize() {
  if (!import.meta.client || _initialized) return
  _initialized = true
  _check()
  _startPolling()
  document.addEventListener('visibilitychange', _onVisibilityChange)
}

export function useServerHealth() {
  _initialize()
  return {
    available: readonly(_available),
  }
}
