const POLL_INTERVAL = 5_000
const FETCH_TIMEOUT = 5_000

const _available = ref(true)
let _timer: ReturnType<typeof setInterval> | null = null
let _listening = false

function _stopPolling() {
  if (_timer !== null) {
    clearInterval(_timer)
    _timer = null
  }
}

function _startPolling(check: () => Promise<void>) {
  _stopPolling()
  _timer = setInterval(check, POLL_INTERVAL)
}

function healthUrl(base: string) {
  return `${base.replace(/\/$/, '')}/health`
}

export function useServerHealth() {
  const config = useRuntimeConfig()
  const baseURL = config.public.serverUrl as string

  async function check() {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    let connected = false
    try {
      const res = await fetch(healthUrl(baseURL), {
        signal: controller.signal,
      })
      connected = res.ok
      _available.value = connected
    } catch {
      _available.value = false
    } finally {
      clearTimeout(timeout)
    }
    console.info(
      'reloaded —',
      connected ? 'connected' : 'unavailable',
    )
  }

  function onVisibilityChange() {
    if (document.hidden) {
      _stopPolling()
    } else {
      check()
      _startPolling(check)
    }
  }

  if (import.meta.client) {
    check()

    onMounted(() => {
      _startPolling(check)
      if (!_listening) {
        _listening = true
        document.addEventListener('visibilitychange', onVisibilityChange)
      }
    })

    onUnmounted(() => {
      _stopPolling()
    })
  }

  return {
    available: readonly(_available),
  }
}
