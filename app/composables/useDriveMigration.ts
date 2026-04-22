import { useAppToast } from '~/composables/useAppToast'

interface MigrateResponse {
  ok: true
  migrated: number
  skipped: number
  remaining: number | null
  done: boolean
  errors: { path: string, reason: string }[]
}

interface MigrationState {
  status: 'idle' | 'running' | 'done' | 'failed'
  totalMigrated: number
  totalSkipped: number
  remaining: number | null
  errors: { path: string, reason: string }[]
}

// Module-scoped singleton: migration is a client-only interaction, and
// sharing the reactive state lets observers (e.g. the FileBrowser) react to
// completion without having to coordinate via events or props.
const state = reactive<MigrationState>({
  status: 'idle',
  totalMigrated: 0,
  totalSkipped: 0,
  remaining: null,
  errors: [],
})

// Drives the Supabase → Drive migration loop. The endpoint is paginated
// (default 50 files per call) and returns `done` when nothing supabase-backed
// is left, so we just call it in a loop until done or the network errors out.
//
// Use:
//   const { state, run } = useDriveMigration()
//   await run()    // resolves once the whole migration finishes
//
// Safe to call once per page load; the inner loop bails on the first non-OK
// response so a torn connection doesn't get re-hammered.
export function useDriveMigration() {
  const { currentWorkspace } = useWorkspaces()
  const toast = useAppToast()

  async function run() {
    const workspaceId = currentWorkspace.value?.id
    if (!workspaceId) return
    if (state.status === 'running') return

    state.status = 'running'
    state.totalMigrated = 0
    state.totalSkipped = 0
    state.errors = []

    try {
      while (true) {
        const res = await $fetch<MigrateResponse>(
          `/api/workspaces/${workspaceId}/integrations/google-drive/migrate`,
          { method: 'POST', body: {} },
        )
        state.totalMigrated += res.migrated
        state.totalSkipped += res.skipped
        state.remaining = res.remaining
        if (res.errors.length) state.errors.push(...res.errors)
        if (res.done) break
        // Empty batch with files still remaining = nothing actionable
        // (probably all skipped because of size). Bail to avoid an infinite loop.
        if (res.migrated === 0 && res.skipped === 0) break
      }
      state.status = 'done'
      if (state.totalMigrated > 0) {
        toast.show(`Migrated ${state.totalMigrated} files to Google Drive.`, 'success')
      }
    }
    catch (err) {
      console.error('[drive-migration] run failed', err)
      state.status = 'failed'
      const message = (err as { statusMessage?: string })?.statusMessage
        || 'Migration failed. Try again from the Integrations page.'
      toast.show(message, 'error')
    }
  }

  return { state, run }
}
