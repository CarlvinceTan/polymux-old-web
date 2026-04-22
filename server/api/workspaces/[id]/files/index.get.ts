import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  type GrantLevel,
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
  storagePrefix,
} from '~~/server/utils/workspaceFiles'

type Backend = 'supabase' | 'google-drive' | 'local'

// GET /api/workspaces/[id]/files?path=reports
// Lists files and folders under a logical path. Applies the per-path
// effective-permission filter — entries the caller cannot read are omitted.
//
// Source of truth is the union of Supabase Storage (for legacy/supabase-backed
// objects) and the `files` metadata table (for rows whose bytes live elsewhere,
// e.g. Google Drive after migration). The metadata row's `backend` column
// wins for provider attribution, so migrated files surface with the correct
// icon even though their storage object has been removed.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const query = getQuery(event)
  const path = normalizePath(query.path)

  const supabase = await serverSupabaseClient(event)

  // Membership gates the whole request — resolve first so the subsequent
  // queries only execute for authorized members.
  const role = await assertMembership(supabase, workspaceId, user.sub)

  const prefix = storagePrefix(workspaceId, path)
  const admin = serverSupabaseServiceRole(event)

  // `files` is client-blocked by RLS, so the metadata read uses the service
  // role — the membership check above already gated access. Scope to direct
  // children of `path` so we don't pull the whole workspace recursively.
  const childPattern = path === '' ? '%' : `${path}/%`
  const grandchildPattern = path === '' ? '%/%' : `${path}/%/%`
  const metadataQuery = admin
    .from('files')
    .select('id, path, kind, backend, size_bytes, backend_mtime')
    .eq('workspace_id', workspaceId)
    .like('path', childPattern)
    .not('path', 'like', grandchildPattern)

  // Fetch everything we need in parallel. The previous implementation
  // awaited `effective_file_permission` once per listed entry, which scaled
  // linearly with folder size and dominated latency on large folders. We
  // now load all workspace grants once and evaluate each entry locally.
  const [listResult, permsResult, orderResult, metadataResult] = await Promise.all([
    supabase.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
    supabase
      .from('workspace_file_permissions')
      .select('path, user_id, grant_level')
      .eq('workspace_id', workspaceId),
    supabase
      .from('file_order')
      .select('ordered_names')
      .eq('workspace_id', workspaceId)
      .eq('parent_path', path)
      .maybeSingle(),
    metadataQuery,
  ])

  if (listResult.error) {
    console.error('[files] list error', listResult.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list files.' })
  }
  if (permsResult.error) {
    console.error('[files] permissions error', permsResult.error)
    throw createError({ statusCode: 500, statusMessage: 'Permission check failed.' })
  }
  if (metadataResult.error) {
    // Non-fatal: fall back to bucket-only listing (provider defaults to supabase).
    console.warn('[files] metadata layer error', metadataResult.error)
  }

  interface MetaEntry {
    id: string
    backend: Backend
    kind: 'file' | 'folder'
    size: number
    mtime: string | null
  }
  const metadataByName = new Map<string, MetaEntry>()
  for (const m of metadataResult.data ?? []) {
    const name = (m.path as string).split('/').pop() ?? (m.path as string)
    metadataByName.set(name, {
      id: m.id as string,
      backend: m.backend as Backend,
      kind: (m.kind as 'file' | 'folder') ?? 'file',
      size: Number(m.size_bytes ?? 0),
      mtime: (m.backend_mtime as string | null) ?? null,
    })
  }

  // Build a permission lookup keyed by path. At each path we track the
  // caller's user-specific grant (wins) and the all-members grant
  // (fallback). Mirrors the `effective_file_permission` RPC exactly.
  const permByPath = new Map<string, { user?: GrantLevel, all?: GrantLevel }>()
  for (const p of permsResult.data ?? []) {
    const entry = permByPath.get(p.path) ?? {}
    if (p.user_id === user.sub) entry.user = p.grant_level as GrantLevel
    else if (p.user_id === null) entry.all = p.grant_level as GrantLevel
    permByPath.set(p.path, entry)
  }

  const roleDefault: GrantLevel = role === 'owner' || role === 'admin' ? 'write' : 'read'

  function evaluatePermission(logicalPath: string): GrantLevel {
    let current = logicalPath
    while (true) {
      const entry = permByPath.get(current)
      if (entry?.user) return entry.user
      if (entry?.all) return entry.all
      if (current === '') break
      const idx = current.lastIndexOf('/')
      current = idx < 0 ? '' : current.slice(0, idx)
    }
    return roleDefault
  }

  const files: Array<{
    id: string
    name: string
    path: string
    size: number
    createdAt: string
    provider: Backend
  }> = []
  const folders: Array<{ name: string, path: string, provider: Backend }> = []
  const seen = new Set<string>()

  for (const item of listResult.data ?? []) {
    const isFolder = item.id === null
    const name = item.name
    if (name === '.keep') continue

    const logicalPath = path ? `${path}/${name}` : name
    if (evaluatePermission(logicalPath) === 'none') continue
    seen.add(name)

    const meta = metadataByName.get(name)
    const provider: Backend = meta?.backend ?? 'supabase'

    if (isFolder) {
      folders.push({ name, path: logicalPath, provider })
    } else {
      files.push({
        id: item.id as string,
        name,
        path: logicalPath,
        size: meta?.size ?? item.metadata?.size ?? 0,
        createdAt: item.created_at ?? new Date().toISOString(),
        provider,
      })
    }
  }

  // Metadata-only entries: rows whose bytes no longer live in the bucket
  // (e.g. migrated to Drive — the Supabase object was removed after upload).
  // Without this, migrated files would vanish from the listing entirely.
  for (const [name, meta] of metadataByName) {
    if (seen.has(name)) continue
    const logicalPath = path ? `${path}/${name}` : name
    if (evaluatePermission(logicalPath) === 'none') continue
    if (meta.kind === 'folder') {
      folders.push({ name, path: logicalPath, provider: meta.backend })
    } else {
      files.push({
        id: meta.id,
        name,
        path: logicalPath,
        size: meta.size,
        createdAt: meta.mtime ?? new Date().toISOString(),
        provider: meta.backend,
      })
    }
  }

  // Apply user-defined ordering if present. Unlisted items keep their current
  // folders-first-alphabetical positions; mixing is handled on the client.
  const orderedNames: string[] = orderResult.data?.ordered_names ?? []
  if (orderedNames.length) {
    const rank = new Map<string, number>()
    orderedNames.forEach((n, i) => rank.set(n, i))
    const byRank = <T extends { name: string }>(a: T, b: T) => {
      const ra = rank.get(a.name) ?? Number.POSITIVE_INFINITY
      const rb = rank.get(b.name) ?? Number.POSITIVE_INFINITY
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    }
    folders.sort(byRank)
    files.sort(byRank)
  }

  return { files, folders, order: orderedNames }
})
