import { onBeforeUnmount, ref, shallowRef, unref, type MaybeRef } from 'vue'

type SpeechRecognitionCtor = new () => any

interface UseSpeechRecognitionOptions {
  lang?: MaybeRef<string | undefined>
  /** Seconds of silence before auto-stopping. 0 disables auto-shutoff. */
  silenceTimeoutSeconds?: MaybeRef<number>
  onFinal?: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (code: string) => void
  onEnd?: () => void
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export async function getMicPermissionState(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state as MicPermissionState
  }
  catch {
    return 'unknown'
  }
}

/**
 * Attempt to (re-)request microphone access. If the site was soft-blocked
 * (e.g. prompt dismissed) the browser may re-prompt. If the user has
 * persistently denied access this resolves false without a prompt.
 */
export async function requestMicAccess(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
    return true
  }
  catch {
    return false
  }
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const isListening = ref(false)
  const isSupported = ref(!!getCtor())
  const recognition = shallowRef<any>(null)
  let silenceTimer: ReturnType<typeof setTimeout> | null = null

  function clearSilenceTimer() {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer)
      silenceTimer = null
    }
  }

  function scheduleSilenceTimer() {
    clearSilenceTimer()
    const seconds = unref(opts.silenceTimeoutSeconds) ?? 0
    if (seconds <= 0 || !isListening.value) return
    silenceTimer = setTimeout(() => {
      stop()
    }, seconds * 1000)
  }

  function onSpeechActivity() {
    scheduleSilenceTimer()
  }

  function ensure() {
    if (recognition.value) return recognition.value
    const Ctor = getCtor()
    if (!Ctor) return null
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e: any) => {
      let final = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) final += res[0].transcript
        else interim += res[0].transcript
      }
      if (final) {
        opts.onFinal?.(final)
        onSpeechActivity()
      }
      if (interim) {
        opts.onInterim?.(interim)
        onSpeechActivity()
      }
    }
    r.onerror = (e: any) => {
      opts.onError?.(e?.error ?? 'unknown')
    }
    r.onend = () => {
      clearSilenceTimer()
      isListening.value = false
      opts.onEnd?.()
    }
    recognition.value = r
    return r
  }

  function start() {
    const r = ensure()
    if (!r) return false
    const lang = unref(opts.lang)
    if (lang) r.lang = lang
    try {
      r.start()
      isListening.value = true
      scheduleSilenceTimer()
      return true
    }
    catch {
      return false
    }
  }

  function stop() {
    clearSilenceTimer()
    try { recognition.value?.stop() }
    catch { /* no-op */ }
  }

  function toggle() {
    if (isListening.value) stop()
    else start()
  }

  onBeforeUnmount(() => {
    clearSilenceTimer()
    try { recognition.value?.abort() }
    catch { /* no-op */ }
  })

  return { isSupported, isListening, start, stop, toggle }
}
