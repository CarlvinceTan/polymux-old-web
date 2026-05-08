import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/folder
// Body: { parent, name, backend?: 'google-drive' | 'local' }
//
// Creates a folder as a metadata row. Folders are pure metadata: index.get.ts
// merges them into the listing without needing a real backend object, since
// children of the folder live in Drive or local OPFS.

type FolderBackend = 'google-drive' | 'local'

interface Body {
  parent?: unknown
  name?: unknown
  backend?: unknown
  backend_ref?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const parent = normalizePath(body.parent)
  const rawName = typeof body.name === 'string' ? body.name : ''
  const safeName = sanitizeSegment(rawName)
  if (!safeName) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid folder name.' })
  }

  const logicalPath = parent ? `${parent}/${safeName}` : safeName

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireWrite(supabase, workspaceId, parent, user.sub)

  const admin = serverSupabaseServiceRole(event)

  const backend: FolderBackend = body.backend === 'local' ? 'local' : 'google-drive'

  const backendRefValue = backend === 'local'
    ? (typeof body.backend_ref === 'string' ? body.backend_ref : null)
    : null

  const { error: upsertError } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: logicalPath,
      kind: 'folder',
      backend,
      backend_ref: backendRefValue,
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path' })

  if (upsertError) {
    console.error('[files] folder metadata upsert error', upsertError)
  }

  return { ok: true as const, path: logicalPath, backend }
})
