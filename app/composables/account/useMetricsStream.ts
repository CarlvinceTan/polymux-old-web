// useMetricsStream opens a WebSocket to the Go backend's /admin/metrics/stream
// and surfaces the latest Snapshot frame as a reactive ref. Auto-reconnects
// with exponential backoff while the consumer is mounted; closes cleanly on
// unmount.
//
// Ported from the console (console/app/composables/useMetricsStream.ts) and
// adapted to web: the JWT is the Supabase access token (passed in the WS query
// string because browsers cannot set an Authorization header on a WebSocket
// handshake), and the base URL is web's runtimeConfig.public.serverUrl. The
// stream is opened straight to Go — it is NOT proxied through the web→Go HTTP
// bridge (server/api/admin/go/[...path].ts), matching the console.
//
// Field names mirror the Go JSON tags in
// polymux/internal/analytics/metrics/snapshot.go — keep in sync on both sides.

import { shallowRef } from 'vue'
import type { Ref } from 'vue'

export interface StatusBreakdown {
  '2xx': number
  '3xx': number
  '4xx': number
  '5xx': number
}

export interface HTTPRouteStats {
  pattern: string
  req: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  status: StatusBreakdown
  bytes_in: number
  bytes_out: number
  rate_1m_rps: number
}

export interface HTTPSubjectStats {
  user_id?: string
  session_id?: string
  req: number
  bytes_in: number
  bytes_out: number
  rate_1m_rps: number
}

export interface LLMModelStats {
  model: string
  input: number
  output: number
  cache_read: number
  cache_create: number
  cache_hit_rate: number
  p50_ms: number
  p99_ms: number
  calls: number
}

export interface LLMSubjectStats {
  user_id?: string
  session_id?: string
  input: number
  output: number
  cache_read: number
  cache_create: number
  calls: number
}

export interface SessionEntry {
  id: string
  user_id: string
  uptime_sec: number
  idle_sec: number
  browser_agents: number
}

export interface GPUDevice {
  index: number
  name: string
  util_pct: number
  mem_used_mb: number
  mem_total_mb: number
  temp_c: number
  power_w: number
}

export interface GPUStats {
  available: boolean
  source?: string
  error?: string
  devices: GPUDevice[]
}

export interface ServerStats {
  uptime_sec: number
  version: string
  goroutines: number
  heap_mb: number
  rss_mb: number
  gc_pause_ms_p99: number
  cpu_pct: number
  sys_mem_used_mb: number
  sys_mem_total_mb: number
  instance_id?: string
  hostname?: string
  started_at?: string
}

export interface InstanceSummary {
  instance_id: string
  hostname: string
  version: string
  started_at: string
  healthy: boolean
  server: ServerStats
}

export interface Snapshot {
  ts: string
  instances: InstanceSummary[]
  server: ServerStats
  http: {
    rate_1m_rps: number
    routes: HTTPRouteStats[]
    by_user: HTTPSubjectStats[]
    by_session: HTTPSubjectStats[]
  }
  llm: {
    by_model: LLMModelStats[]
    by_session: LLMSubjectStats[]
    by_user: LLMSubjectStats[]
  }
  sessions: {
    total: number
    by_user: Record<string, number>
    entries: SessionEntry[]
  }
  gpu: GPUStats
}

export function useMetricsStream(): {
  snapshot: Ref<Snapshot | null>
  connected: Ref<boolean>
  error: Ref<string | null>
} {
  // shallowRef: every frame replaces the snapshot wholesale, so deep
  // reactivity over the nested object tree just adds proxy-walk overhead
  // (~1 Hz × instances/routes/sessions/gpus is non-trivial).
  const snapshot = shallowRef<Snapshot | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)

  const config = useRuntimeConfig()
  const session = useSupabaseSession()

  let ws: WebSocket | null = null
  let backoff = 500
  let stopped = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function streamUrl(token: string): string {
    // WebSocket URL: scheme swap http(s) -> ws(s); pass the token via query
    // param because browsers can't set Authorization on a WS handshake.
    const base = (config.public.serverUrl as string).replace(/^http/, 'ws')
    return `${base}/admin/metrics/stream?token=${encodeURIComponent(token)}`
  }

  function scheduleReconnect() {
    if (stopped) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, backoff)
    backoff = Math.min(backoff * 2, 10000)
  }

  function connect() {
    if (stopped) return
    const token = session.value?.access_token
    if (!token) {
      error.value = 'Not authenticated.'
      scheduleReconnect()
      return
    }
    try {
      ws = new WebSocket(streamUrl(token))
      ws.onopen = () => {
        connected.value = true
        error.value = null
        backoff = 500
      }
      ws.onmessage = (ev) => {
        try {
          snapshot.value = JSON.parse(ev.data) as Snapshot
        }
        catch (e) {
          error.value = `parse error: ${(e as Error).message}`
        }
      }
      ws.onerror = () => {
        error.value = 'websocket error'
      }
      ws.onclose = () => {
        connected.value = false
        ws = null
        scheduleReconnect()
      }
    }
    catch (e) {
      error.value = (e as Error).message
      scheduleReconnect()
    }
  }

  onMounted(() => {
    connect()
  })

  onBeforeUnmount(() => {
    stopped = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) ws.close()
  })

  return { snapshot, connected, error }
}
