import { ref, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  dismissed_at: string | null
  created_at: string
}

/** Module-level state — the inbox, toast queue, and realtime channel are app-global. */
const notifications = ref<AppNotification[]>([])
const pendingToasts = ref<AppNotification[]>([])
let channel: RealtimeChannel | null = null
let subscribedUserId: string | null = null
let initialFetchDone = false

function upsertLocal(n: AppNotification) {
  const idx = notifications.value.findIndex(x => x.id === n.id)
  if (idx === -1) notifications.value = [n, ...notifications.value]
  else notifications.value = notifications.value.map(x => x.id === n.id ? n : x)
}

async function fetchAll() {
  if (!import.meta.client) return
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  if (!user.value) return
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[useNotifications] fetchAll failed', error)
    return
  }
  notifications.value = (data ?? []) as AppNotification[]
  initialFetchDone = true
}

function subscribe() {
  if (!import.meta.client) return
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const uid = user.value?.id
  if (!uid) return
  if (channel && subscribedUserId === uid) return
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
  }
  subscribedUserId = uid
  channel = supabase
    .channel(`user-notifications-${uid}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${uid}`,
      },
      (payload) => {
        const row = payload.new as AppNotification
        upsertLocal(row)
        // Only surface a toast when the row is genuinely new to this client
        // (initial fetch has run; otherwise the fetch itself will render it).
        if (initialFetchDone) {
          pendingToasts.value = [...pendingToasts.value, row]
        }
      },
    )
    .subscribe()
}

function teardown() {
  if (channel) {
    const supabase = useSupabaseClient()
    supabase.removeChannel(channel)
    channel = null
  }
  subscribedUserId = null
  initialFetchDone = false
  notifications.value = []
  pendingToasts.value = []
}

async function dismiss(id: string) {
  const before = notifications.value
  notifications.value = notifications.value.filter(n => n.id !== id)
  pendingToasts.value = pendingToasts.value.filter(n => n.id !== id)
  const supabase = useSupabaseClient()
  const { error } = await supabase
    .from('user_notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('[useNotifications] dismiss failed', error)
    notifications.value = before
  }
}

async function clearAll() {
  const ids = notifications.value.map(n => n.id)
  const before = notifications.value
  notifications.value = []
  if (!ids.length) return
  const supabase = useSupabaseClient()
  const { error } = await supabase
    .from('user_notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .in('id', ids)
  if (error) {
    console.error('[useNotifications] clearAll failed', error)
    notifications.value = before
  }
}

function dismissToast(id: string) {
  pendingToasts.value = pendingToasts.value.filter(n => n.id !== id)
}

export function useNotifications() {
  return {
    notifications,
    hasNotifications: computed(() => notifications.value.length > 0),
    pendingToasts,
    fetchAll,
    subscribe,
    teardown,
    dismiss,
    clearAll,
    dismissToast,
  }
}
