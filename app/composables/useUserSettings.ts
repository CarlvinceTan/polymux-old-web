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
}

const settings = ref<UserSettings>({ blog_newsletter_subscribed: false })
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
      settings.value = { blog_newsletter_subscribed: false }
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
        .select('blog_newsletter_subscribed')
        .eq('user_id', uid)
        .maybeSingle()

      if (error) {
        console.error('[useUserSettings] fetch error:', error)
      }
      else {
        settings.value = {
          blog_newsletter_subscribed: data?.blog_newsletter_subscribed ?? false,
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
      const result = await $fetch<{ blog_newsletter_subscribed: boolean }>('/api/user-settings', {
        method: 'PATCH',
        body: patch,
      })

      // Reconcile with server truth.
      settings.value = {
        blog_newsletter_subscribed: result.blog_newsletter_subscribed,
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
          const newRow = payload.new as { blog_newsletter_subscribed: boolean } | undefined
          if (newRow) {
            settings.value = {
              blog_newsletter_subscribed: newRow.blog_newsletter_subscribed ?? false,
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
        settings.value = { blog_newsletter_subscribed: false }
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
