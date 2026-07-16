import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * useUserSettings – singleton composable that keeps user_settings in sync with
 * Supabase as the single source of truth.
 *
 * Both `blog.vue` and `settings.vue` consume this composable so they always
 * share the same reactive state. Any mutation goes through the API route
 * (`/api/user-settings`) and re-reads the authoritative value returned by the
 * server before updating the local ref.
 *
 * A Realtime subscription keeps the local state in sync when the row changes
 * externally (e.g. another tab or a direct DB update).
 */

interface UserSettings {
  blog_newsletter_subscribed: boolean
  // Show cursor overlay: when true, the live browser viewport renders the
  // agent's cursor on top of the screencast at the position the driver
  // (midas) is dispatching. On by default — users can turn it off from the
  // prompt-input OPTIONS menu.
  show_cursor_overlay: boolean
  // Master kill-switch for non-essential emails sent by the web app
  // (workspace invitations, blog newsletter, etc). When false, the shared
  // email helper drops these sends. Important emails dispatched from the
  // admin console pass `bypassUserPreferences: true` and ignore the flag.
  all_notifications_enabled: boolean
  // Seconds of silence before the prompt voice button auto-stops listening.
  // 0 keeps manual-only behavior; default is 5 seconds.
  voice_auto_shutoff_seconds: number
}

const defaults: UserSettings = {
  blog_newsletter_subscribed: false,
  show_cursor_overlay: true,
  all_notifications_enabled: true,
  voice_auto_shutoff_seconds: 5,
}

const settings = ref<UserSettings>({ ...defaults })
const loading = ref(false)
const saving = ref(false)
let fetchedForUserId: string | null = null
let realtimeChannel: RealtimeChannel | null = null

export function useUserSettings() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  /**
   * Fetch the authoritative settings row from Supabase.
   * Short-circuits if we already fetched for the current user.
   */
  async function fetchSettings(force = false) {
    if (!user.value) {
      settings.value = { ...defaults }
      fetchedForUserId = null
      return
    }

    const uid = user.value.sub
    if (!uid) return

    // Skip re-fetch if we already have data for this user (unless forced).
    if (!force && fetchedForUserId === uid) return

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('blog_newsletter_subscribed, show_cursor_overlay, all_notifications_enabled, voice_auto_shutoff_seconds')
        .eq('user_id', uid)
        .maybeSingle()

      if (error) {
        console.error('[useUserSettings] fetch error:', error)
      }
      else {
        settings.value = {
          blog_newsletter_subscribed: data?.blog_newsletter_subscribed ?? defaults.blog_newsletter_subscribed,
          show_cursor_overlay: data?.show_cursor_overlay ?? defaults.show_cursor_overlay,
          all_notifications_enabled: data?.all_notifications_enabled ?? defaults.all_notifications_enabled,
          voice_auto_shutoff_seconds: data?.voice_auto_shutoff_seconds ?? defaults.voice_auto_shutoff_seconds,
        }
      }

      fetchedForUserId = uid
    }
    catch (e) {
      console.error('[useUserSettings] exception:', e)
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Persist a partial settings update via the API route and then reconcile
   * the local state with the server-returned values.
   */
  async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
    if (!user.value) return

    saving.value = true
    // Optimistic update so the UI feels instant.
    const previous = { ...settings.value }
    settings.value = { ...settings.value, ...patch }

    try {
      const result = await $fetch<{ blog_newsletter_subscribed: boolean, show_cursor_overlay: boolean, all_notifications_enabled: boolean, voice_auto_shutoff_seconds: number }>('/api/user-settings', {
        method: 'PATCH',
        body: patch,
      })

      // Reconcile with server truth.
      settings.value = {
        blog_newsletter_subscribed: result.blog_newsletter_subscribed,
        show_cursor_overlay: result.show_cursor_overlay,
        all_notifications_enabled: result.all_notifications_enabled,
        voice_auto_shutoff_seconds: result.voice_auto_shutoff_seconds,
      }
      fetchedForUserId = user.value.sub
    }
    catch (e) {
      console.error('[useUserSettings] save error:', e)
      // Roll back on failure.
      settings.value = previous
      throw e
    }
    finally {
      saving.value = false
    }
  }

  function setupRealtime(uid: string) {
    teardownRealtime()
    if (!import.meta.client) return

    realtimeChannel = supabase
      .channel('user-settings-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const newRow = payload.new as { blog_newsletter_subscribed: boolean, show_cursor_overlay: boolean, all_notifications_enabled: boolean, voice_auto_shutoff_seconds: number } | undefined
          if (newRow) {
            settings.value = {
              blog_newsletter_subscribed: newRow.blog_newsletter_subscribed ?? defaults.blog_newsletter_subscribed,
              show_cursor_overlay: newRow.show_cursor_overlay ?? defaults.show_cursor_overlay,
              all_notifications_enabled: newRow.all_notifications_enabled ?? defaults.all_notifications_enabled,
              voice_auto_shutoff_seconds: newRow.voice_auto_shutoff_seconds ?? defaults.voice_auto_shutoff_seconds,
            }
            fetchedForUserId = uid
          }
        },
      )
      .subscribe()
  }

  function teardownRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  watch(
    user,
    async (newUser) => {
      if (newUser) {
        await fetchSettings()
        setupRealtime(newUser.id)
      }
      else {
        settings.value = { ...defaults }
        fetchedForUserId = null
        teardownRealtime()
      }
    },
    { immediate: true },
  )

  return {
    settings: readonly(settings),
    loading: readonly(loading),
    saving: readonly(saving),
    fetchSettings,
    saveSettings,
  }
}
