import { ref, watch, onMounted, onUnmounted, readonly } from 'vue'
import type { Ref } from 'vue'
import type {
  ConnectionStatus,
  Envelope,
  SessionStatePayload,
  ErrorPayload,
  SessionExpiredPayload,
} from '../types'

async function getAccessToken(): Promise<string> {
  if (!import.meta.client) return ''
  const supabase = useSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export function useWorkflowSession(sessionId: Ref<string> | string) {
  const idRef = typeof sessionId === 'string' ? ref(sessionId) : sessionId

  const status = ref<ConnectionStatus>('disconnected')
  const sessionState = ref<SessionStatePayload | null>(null)
  const lastError = ref<ErrorPayload | null>(null)
  const expired = ref<SessionExpiredPayload | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const handlers = new Map<string, Set<Function>>()
  const binaryHandlers = new Set<(data: ArrayBuffer) => void>()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let intentionallyClosed = false
  let generation = 0
  // Buffered until the socket reaches OPEN. Lets callers fire `send` during
  // the connect/reconnect window without having to set up their own
  // wait-for-status watcher — the first prompt on a freshly-promoted draft
  // would otherwise be dropped because agent.vue mounts before the WS opens.
  const pendingSends: Array<{ type: string, payload: unknown }> = []

  function dispatch(type: string, payload: unknown) {
    const set = handlers.get(type)
    if (!set) return
    for (const h of set) {
      try {
        h(payload)
      } catch (err) {
        console.error(`[useWorkflowSession] handler error for "${type}"`, err)
      }
    }
  }

  function scheduleReconnect() {
    if (intentionallyClosed) return
    status.value = 'reconnecting'
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000)
    reconnectAttempts++
    reconnectTimer = setTimeout(connect, delay)
  }

  async function connect() {
    if (!import.meta.client) return

    const myGen = ++generation
    const id = idRef.value
    const config = useRuntimeConfig()
    const serverUrl = (config.public.serverUrl as string).replace(/^http/, 'ws')
    const token = await getAccessToken()
    const params = new URLSearchParams()
    if (token) params.set('token', token)
    const qs = params.toString()
    const url = qs ? `${serverUrl}/session/${id}/?${qs}` : `${serverUrl}/session/${id}/`

    status.value = 'connecting'

    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    ws = socket

    socket.onopen = () => {
      if (myGen !== generation) return
      status.value = 'connected'
      reconnectAttempts = 0
      flushPendingSends()
    }

    socket.onmessage = (event: MessageEvent) => {
      if (myGen !== generation) return

      if (event.data instanceof ArrayBuffer) {
        for (const h of binaryHandlers) {
          try { h(event.data) } catch (err) { console.error('[useWorkflowSession] binary handler error', err) }
        }
        return
      }

      let envelope: Envelope
      try {
        envelope = JSON.parse(event.data as string) as Envelope
      } catch {
        console.warn('[useWorkflowSession] failed to parse message', event.data)
        return
      }

      if (envelope.type === 'session_state') {
        sessionState.value = envelope.payload as SessionStatePayload
      } else if (envelope.type === 'error') {
        const p = envelope.payload as ErrorPayload
        lastError.value = p
        if (!p.recoverable) intentionallyClosed = true
      } else if (envelope.type === 'session_expired') {
        expired.value = envelope.payload as SessionExpiredPayload
        intentionallyClosed = true
      }

      dispatch(envelope.type, envelope.payload)
    }

    socket.onclose = () => {
      if (myGen !== generation) return
      ws = null
      if (intentionallyClosed) {
        status.value = 'disconnected'
      } else {
        scheduleReconnect()
      }
    }

    socket.onerror = (err) => {
      console.error('[useWorkflowSession] WebSocket error', err)
      // onclose will fire after onerror; let it handle reconnect
    }
  }

  function disconnect() {
    intentionallyClosed = true
    generation++ // invalidate any in-flight onclose/onmessage
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws?.close()
    ws = null
    status.value = 'disconnected'
    pendingSends.length = 0
  }

  function flushPendingSends() {
    while (pendingSends.length > 0) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const item = pendingSends.shift()!
      const envelope: Envelope = {
        type: item.type,
        payload: item.payload,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      }
      ws.send(JSON.stringify(envelope))
    }
  }

  function send<T>(type: string, payload: T) {
    if (intentionallyClosed) {
      console.warn(`[useWorkflowSession] send dropped — closed`, type)
      return
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pendingSends.push({ type, payload })
      return
    }
    const envelope: Envelope<T> = {
      type,
      payload,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    ws.send(JSON.stringify(envelope))
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  function on<T>(type: string, handler: (payload: T) => void) {
    if (!handlers.has(type)) handlers.set(type, new Set())
    handlers.get(type)!.add(handler as Function)
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  function off<T>(type: string, handler: (payload: T) => void) {
    handlers.get(type)?.delete(handler as Function)
  }

  function onBinary(handler: (data: ArrayBuffer) => void) {
    binaryHandlers.add(handler)
  }

  function offBinary(handler: (data: ArrayBuffer) => void) {
    binaryHandlers.delete(handler)
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  watch(idRef, () => {
    disconnect()
    intentionallyClosed = false
    sessionState.value = null
    lastError.value = null
    expired.value = null
    reconnectAttempts = 0
    connect()
  })

  return {
    status: readonly(status),
    sessionState: readonly(sessionState),
    lastError: readonly(lastError),
    expired: readonly(expired),
    send,
    on,
    off,
    onBinary,
    offBinary,
    connect,
    disconnect,
  }
}

export type SessionHandle = ReturnType<typeof useWorkflowSession>
