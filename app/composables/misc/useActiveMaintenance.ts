import { ref, computed, readonly, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Polymux service-downtime banner state.
//
// One row in public.maintenance_windows describes a scheduled or in-progress
// window. The Supabase RLS policy on that table only returns rows for which
// `now() >= starts_at - 72h AND now() <= ends_at AND cancelled_at IS NULL`,
// so any row the client sees is by definition either "scheduled within 72h"
// or "in progress" — no further client-side envelope check needed.
//
// Singleton state: the banner is mounted once in the default layout and
// every consumer (banner + tests + notification deep links) reads the same
// ref. The realtime channel is bound to the current Supabase JWT, so we
// watch useSupabaseUser() and tear-down / rebuild the channel whenever the
// signed-in user changes — including soft sign-in flows that don't trigger
// a hard page navigation. The 60s visibility tick is bootstrapped once.

export interface MaintenanceWindow {
  id: string
  title: string
  description: string
  starts_at: string
  ends_at: string
  cancelled_at: string | null
}

type MaintenanceState = 'none' | 'scheduled' | 'active'

const _active = ref<MaintenanceWindow | null>(null)
const _now = ref(Date.now())
let _channel: RealtimeChannel | null = null
let _tickInstalled = false
let _watchInstalled = false
let _tick: ReturnType<typeof setInterval> | null = null
let _subscribedUserId: string | null = null

async function _fetch() {
  if (!import.meta.client) return
  const supabase = useSupabaseClient()
  const { data, error } = await supabase
    .from('maintenance_windows')
    .select('id,title,description,starts_at,ends_at,cancelled_at')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    // 406 is the not-found shape from maybeSingle when zero rows match —
    // surfaced as PGRST116. That's the normal case (no active window) and
    // we don't want to log it.
    if ((error as { code?: string }).code !== 'PGRST116') {
      console.warn('[useActiveMaintenance] fetch failed', error)
    }
    _active.value = null
    return
  }
  _active.value = (data as MaintenanceWindow | null) ?? null
}

function _subscribe() {
  if (!import.meta.client) return
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const uid = user.value?.id ?? null
  if (_channel && _subscribedUserId === uid) return
  if (_channel) {
    supabase.removeChannel(_channel)
    _channel = null
  }
  _subscribedUserId = uid
  // Note: maintenance windows are app-wide, not per-user, but Supabase
  // requires a stable channel name and the channel inherits the JWT in
  // effect at subscribe time. Keying by uid forces a clean rebuild when
  // auth changes.
  _channel = supabase
    .channel(`maintenance-windows-${uid ?? 'anon'}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'maintenance_windows' },
      () => { void _fetch() },
    )
    .subscribe()
}

function _initialize() {
  if (!import.meta.client) return
  if (!_watchInstalled) {
    _watchInstalled = true
    // Rebuild the subscription whenever the signed-in user flips. The
    // watcher fires `immediate` so the first invocation handles the
    // initial sign-in state too. _subscribe() itself short-circuits when
    // the uid hasn't actually changed.
    const user = useSupabaseUser()
    watch(user, () => {
      void _fetch()
      _subscribe()
    }, { immediate: true })
  }
  if (_tickInstalled) return
  _tickInstalled = true
  // Re-evaluate state every 60s so Scheduled → In progress flips without
  // waiting for a realtime event (the row itself isn't changing — only
  // wall-clock time relative to starts_at). Also catches the visibility
  // transition when a window first enters the 72h envelope without an
  // INSERT firing.
  _tick = setInterval(() => {
    _now.value = Date.now()
    // Cheap re-poll every minute to cover the case where the client was
    // connected for >72h and the row first becomes visible without an
    // INSERT event (Postgres clock change, not row change).
    void _fetch()
  }, 60_000)
}

function _state(): MaintenanceState {
  const w = _active.value
  if (!w) return 'none'
  const start = new Date(w.starts_at).getTime()
  const end = new Date(w.ends_at).getTime()
  const t = _now.value
  if (t < start) return 'scheduled'
  if (t <= end) return 'active'
  return 'none'
}

export function useActiveMaintenance() {
  _initialize()
  return {
    window: readonly(_active),
    state: computed(_state),
    now: readonly(_now),
  }
}
