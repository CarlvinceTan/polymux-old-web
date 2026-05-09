import { serverSupabaseServiceRole } from '#supabase/server'
import { requirePolymuxSecret } from '~~/server/utils/internalAuth'
import { artifactCap } from '~~/server/utils/planLimits'

// POST /api/internal/artifacts
// Body: {
//   session_id: string,           // required
//   workspace_id: string,         // required (denormalized — Go already knows it)
//   name: string,                 // required (display name + filename hint)
//   mime_type?: string,
//   size_bytes?: number,          // bytes-on-disk; 0 for inline content
//   storage_path?: string,        // object key in `artifacts` bucket
//   content?: string,             // inline body for small text artifacts
//   created_by_agent_id?: string  // browser agent id, if a sub-agent produced it
// }
//
// Called by Go after SaveArtifact uploads the bytes (or directly with `content`
// for small text artifacts that skip the storage round-trip). One of
// storage_path or content must be set.

interface Body {
  session_id?: unknown
  workspace_id?: unknown
  name?: unknown
  mime_type?: unknown
  size_bytes?: unknown
  storage_path?: unknown
  content?: unknown
  created_by_agent_id?: unknown
}

export default defineEventHandler(async (event) => {
  await requirePolymuxSecret(event)
  const body = await readBody<Body>(event)

  const sessionId = typeof body.session_id === 'string' ? body.session_id : ''
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!sessionId || !workspaceId || !name) {
    console.warn('[internal/artifacts] rejected: missing required fields', {
      hasSession: !!sessionId, hasWorkspace: !!workspaceId, hasName: !!name,
    })
    throw createError({
      statusCode: 400,
      statusMessage: 'session_id, workspace_id, and name are required.',
    })
  }

  const storagePath = typeof body.storage_path === 'string' && body.storage_path
    ? body.storage_path
    : null
  const content = typeof body.content === 'string' ? body.content : null
  if (!storagePath && content === null) {
    console.warn('[internal/artifacts] rejected: storage_path and content both empty', {
      sessionId, workspaceId, name,
    })
    throw createError({
      statusCode: 400,
      statusMessage: 'one of storage_path or content is required.',
    })
  }

  console.info('[internal/artifacts] record request', {
    sessionId, workspaceId, name,
    mime: typeof body.mime_type === 'string' ? body.mime_type : null,
    size: Number(body.size_bytes) || 0,
    via: storagePath ? 'storage_path' : 'inline',
  })

  const mimeType = typeof body.mime_type === 'string' && body.mime_type
    ? body.mime_type
    : null
  const sizeRaw = Number(body.size_bytes)
  const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.floor(sizeRaw) : 0
  const agentId = typeof body.created_by_agent_id === 'string' && body.created_by_agent_id
    ? body.created_by_agent_id
    : null

  const admin = serverSupabaseServiceRole(event)

  // Enforce workspace-wide artifact bucket cap. Sum all existing rows for
  // this workspace and reject the new one (returning 413) if it would push
  // total usage over the plan cap. On rejection, remove the bucket object
  // we were about to record so the bytes don't leak.
  const { data: workspaceRow } = await admin
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  const plan = typeof workspaceRow?.plan === 'string' ? workspaceRow.plan : 'free'
  const cap = artifactCap(plan)

  const { data: usageRows } = await admin
    .from('artifacts')
    .select('size_bytes')
    .eq('workspace_id', workspaceId)
  let usage = 0
  for (const row of usageRows ?? []) {
    const n = Number((row as { size_bytes?: number | null }).size_bytes ?? 0)
    if (Number.isFinite(n) && n > 0) usage += Math.floor(n)
  }

  if (cap > 0 && usage + sizeBytes > cap) {
    console.warn('[internal/artifacts] cap rejection', {
      workspaceId, plan, usage, size: sizeBytes, cap,
    })
    if (storagePath) {
      const { error: removeErr } = await admin.storage.from('artifacts').remove([storagePath])
      if (removeErr) {
        console.error('[internal/artifacts] cleanup after cap rejection failed', removeErr)
      }
    }
    throw createError({
      statusCode: 413,
      statusMessage: 'ARTIFACT_QUOTA_EXCEEDED',
      data: { usage, size: sizeBytes, cap, plan },
    })
  }

  const { data, error } = await admin
    .from('artifacts')
    .insert({
      session_id: sessionId,
      workspace_id: workspaceId,
      name,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      storage_path: storagePath,
      content,
      created_by_agent_id: agentId,
    })
    .select('id, session_id, workspace_id, name, mime_type, size_bytes, storage_path, content, created_by_agent_id, created_at')
    .single()

  if (error || !data) {
    console.error('[internal/artifacts] insert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record artifact.' })
  }

  console.info('[internal/artifacts] recorded', {
    id: data.id, sessionId, workspaceId, name, size: sizeBytes,
  })
  return data
})
