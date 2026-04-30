/**
 * Centralized sign-out. `useState` caches and live WebSocket sessions persist across SPA
 * navigation, so a plain `supabase.auth.signOut()` leaves stale chat/workspace/wallet state
 * in memory. We clear per-user localStorage and full-reload to `/` to drop all in-memory state.
 *
 * Latency: the network revoke can take 500ms+ on a cold connection. Awaiting it before the
 * redirect makes the UI feel frozen after the user clicks "Sign out". Instead we kick the
 * revoke off in the background, clear local session synchronously, and navigate immediately.
 * The hard reload on `/` re-initialises the Supabase client which sees no session, so the
 * user is fully logged out from this device the moment the next page loads. The fire-and-
 * forget call still revokes the refresh token server-side so other devices/tabs honour the
 * sign-out shortly after.
 */
export function useSignOut() {
  const supabase = useSupabaseClient()

  function signOut() {
    if (import.meta.client) {
      try {
        localStorage.removeItem('polymux_current_workspace_id')
      }
      catch { /* ignore storage access errors */ }
    }

    // Fire-and-forget. The supabase-js call clears the local session
    // synchronously before issuing the network revoke, so the upcoming
    // hard reload on `/` lands without a valid session.
    supabase.auth.signOut().catch((err) => {
      console.error('[useSignOut] signOut failed', err)
    })

    if (import.meta.client) {
      window.location.assign('/')
    }
  }

  return { signOut }
}
