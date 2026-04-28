import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  normalizePath,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
  storageKey,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/folder
// Body: { parent, name, backend?: 'supabase' | 'google-drive' | 'local' }
//
// Creates a folder metadata row and — for supabase-backed folders — a
// `.keep` marker at `{parent}/{name}/.keep` so the Supabase Storage listing
// returns the folder. Drive/local folders are pure metadata rows: index.get.ts
// merges metadata-only entries into the listing, and no bucket object is
// needed for a folder whose children don't live in Supabase Storage either.

type FolderBackend = 'supabase' | 'google-drive' | 'local'

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

  const backend: FolderBackend
    = body.backend === 'google-drive' ? 'google-drive'
    : body.backend === 'local' ? 'local'
    : 'supabase'

  if (backend === 'supabase') {
    const keepKey = storageKey(workspaceId, `${logicalPath}/.keep`)
    const keepBody = new Blob(['\n'], { type: 'text/plain' })
    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(keepKey, keepBody, {
        contentType: 'text/plain',
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      console.error('[files] folder create upload error', uploadError)
      throw createError({ statusCode: 500, statusMessage: uploadError.message })
    }
  }

  const backendRefValue = backend === 'supabase'
    ? storageKey(workspaceId, logicalPath)
    : backend === 'local'
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
