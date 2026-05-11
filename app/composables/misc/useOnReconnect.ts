/**
 * Re-runs `load` whenever the server transitions from unavailable back to
 * available (per `useServerHealth`). Pairs with the page/component's existing
 * `onMounted` fetch — the initial fetch fires on mount; this catches the case
 * where it failed because the server was down and re-fires it on reconnect.
 */
export function useOnReconnect(load: () => void | Promise<void>) {
  const { available } = useServerHealth()
  watch(available, (avail, prev) => {
    if (!avail || prev) return
    try {
      const r = load()
      if (r && typeof (r as Promise<void>).then === 'function') {
        ;(r as Promise<void>).catch(() => {})
      }
    }
    catch {
      // Loaders are expected to handle their own errors; swallow anything
      // that escapes so a single failure doesn't break future reconnects.
    }
  })
}
