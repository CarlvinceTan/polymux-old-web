import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// GET /api/marketplace/my-workflows
//
// Lists workflows the current user can pick when publishing a kind='workflow'
// catalog row. We surface anything readable to the user under RLS — the
// existing workflow_versions policies already enforce membership.
//
// For each workflow we return its id, name, description, and its most
// recent published-style version (the "tip" the editor will offer to
// publish). The editor can let the author pick a different version if
// they want.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const supabase = await serverSupabaseClient(event)
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null, error: { message: string } | null }>
      }
    }
  }

  const { data, error } = await sb
    .from('workflows')
    .select(`
      id, workspace_id, name, description, created_by, created_at, updated_at,
      latest_version:workflow_versions (
        id, version, source, change_summary, created_at
      )
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[marketplace] my-workflows error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load workflows.' })
  }

  // Flatten: pick the highest-version row per workflow for the editor's
  // default. The editor can fetch the full version list when the author
  // expands the dropdown.
  type Wf = { id: string, latest_version?: Array<{ id: string, version: number, change_summary?: string | null, created_at: string }> }
  return (data ?? []).map((w) => {
    const wf = w as Wf
    const versions = wf.latest_version ?? []
    const latest = versions.reduce<{ id: string, version: number, change_summary?: string | null, created_at: string } | null>(
      (acc, v) => (acc === null || v.version > acc.version ? v : acc),
      null,
    )
    return {
      ...w,
      latest_version: latest,
    }
  })
})
