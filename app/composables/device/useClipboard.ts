import { ref } from 'vue'

export function useClipboard({ copiedDuring = 1500 } = {}) {
  const copied = ref(false)
  let timeout: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copied.value = true
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => { copied.value = false }, copiedDuring)
  }

  return { copy, copied }
}
