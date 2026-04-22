/**
 * Centralized sign-out. `useState` caches and live WebSocket sessions persist across SPA
 * navigation, so a plain `supabase.auth.signOut()` leaves stale chat/workspace/wallet state
 * in memory. We clear per-user localStorage and full-reload to `/` to drop all in-memory state.
 */
export function useSignOut() {
  const supabase = useSupabaseClient()

  async function signOut() {
    try {
      await supabase.auth.signOut()
    }
    catch (err) {
      console.error('[useSignOut] signOut failed', err)
    }

    if (import.meta.client) {
      try {
        localStorage.removeItem('polymux_current_workspace_id')
      }
      catch { /* ignore storage access errors */ }

      window.location.assign('/')
    }
  }

  return { signOut }
}
