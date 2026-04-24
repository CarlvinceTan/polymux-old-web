export function useRelativeTime() {
  function relativeTime(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    if (seconds < 60) return rtf.format(-seconds, 'second')
    if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute')
    if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour')
    return rtf.format(-Math.floor(seconds / 86400), 'day')
  }

  return { relativeTime }
}
