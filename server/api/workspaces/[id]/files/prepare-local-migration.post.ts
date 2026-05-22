import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/prepare-local-migration
// Body: { source: 'google-drive'|'local', batch_size?, device_id? }
//
// Returns the next batch of files in `source` that the client should pull
// down and process. For source='google-drive' the client fetches each file's
// bytes via /download-url (which streams them via the drive-stream proxy),
// writes them locally, then calls /finalize-local-migration with the file ids
// it successfully stored. For source='local' (the reverse direction) the batch
// is filtered to rows whose backend_ref matches the caller's `device_id`,
// since only that device holds the bytes — the client then reads from OPFS
// and uploads to the target backend via /upload-url.

interface Body {
  source?: unknown
  batch_size?: unknown
  device_id?: unknown
}

const DEFAULT_BATCH = 25
const MAX_BATCH = 100

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event).catch(() => ({} as Body))
  const source: 'google-drive' | 'local'
    = body?.source === 'local' ? 'local' : 'google-drive'
  const batchSize = clamp(Number(body?.batch_size) || DEFAULT_BATCH, 1, MAX_BATCH)
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : ''
  if (source === 'local' && !deviceId) {
    throw createError({ statusCode: 400, statusMessage: 'device_id required when source=local.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners and admins can migrate workspace files.',
    })
  }

  const admin = serverSupabaseServiceRole(event)
  let batchQuery = admin
    .from('files')
    .select('id, path, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .eq('backend', source)
    .eq('kind', 'file')
  if (source === 'local') batchQuery = batchQuery.eq('backend_ref', deviceId)
  batchQuery = batchQuery.order('created_at', { ascending: true }).limit(batchSize)

  const { data: rowsRaw, error: listError } = await batchQuery
  if (listError) {
    console.error('[prepare-local-migration] list failed', listError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list files.' })
  }

  let countQuery = admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('backend', source)
    .eq('kind', 'file')
  if (source === 'local') countQuery = countQuery.eq('backend_ref', deviceId)
  const { count: remaining } = await countQuery

  return {
    ok: true as const,
    source,
    items: (rowsRaw ?? []).map(r => ({
      file_id: r.id,
      path: r.path,
      size_bytes: r.size_bytes ?? 0,
      content_type: r.content_type ?? null,
    })),
    remaining: remaining ?? 0,
    done: (remaining ?? 0) === 0,
  }
})

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}
