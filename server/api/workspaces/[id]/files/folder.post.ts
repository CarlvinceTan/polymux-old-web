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
// Body: { parent, name }
//
// Creates a folder by uploading a `.keep` marker at `{parent}/{name}/.keep`.
// Also upserts a `files` metadata row with kind='folder' so permissions and
// Drive-side sync can reference the folder as an entity.

interface Body {
  parent?: unknown
  name?: unknown
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

  const { error: upsertError } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: logicalPath,
      kind: 'folder',
      backend: 'supabase',
      backend_ref: storageKey(workspaceId, logicalPath),
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path' })

  if (upsertError) {
    console.error('[files] folder metadata upsert error', upsertError)
  }

  return { ok: true as const, path: logicalPath }
})
