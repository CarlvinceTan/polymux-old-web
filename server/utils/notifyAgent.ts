// Fire-and-forget notifier that tells the Go backend to invalidate cached
// state. Used by permissions endpoints so active sessions refetch grants
// within one round-trip instead of waiting for the 30s TTL.
//
// Any failure is logged and swallowed — the user-facing request succeeds on
// the DB write alone; invalidation is a best-effort optimisation.

export async function notifyPermissionsChanged(workspaceId: string): Promise<void> {
  const cfg = useRuntimeConfig()
  const serverUrl = cfg.public.serverUrl
  const token = cfg.polymuxSecret
  if (!serverUrl || !token) {
    return
  }

  try {
    await $fetch(`${serverUrl}/internal/permissions-invalidated`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: { workspace_id: workspaceId },
    })
  } catch (err) {
    console.warn('[notifyPermissionsChanged] failed to notify agent', err)
  }
}
