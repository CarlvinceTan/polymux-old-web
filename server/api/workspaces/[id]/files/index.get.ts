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
  const [listResult, permsResult, orderResult, metadataResult, integrationsResult] = await Promise.all([
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
    admin
      .from('workspace_integrations')
      .select('provider')
      .eq('workspace_id', workspaceId),
  ])

  // Backends that are currently usable for this workspace. supabase is
  // always available for an authenticated workspace; other backends require
  // their integration row to exist. Folder rows pointing at a backend that's
  // no longer connected are orphans (e.g. drive disconnected before its
  // folder rows were flipped) — we self-heal them below.
  const installedProviders = new Set<string>(
    (integrationsResult.data ?? []).map(r => r.provider as string),
  )
  function backendIsLive(backend: Backend): boolean {
    if (backend === 'supabase') return true
    if (backend === 'google-drive') return installedProviders.has('google-drive')
    // 'local' folders only resolve on the device that owns them, but a
    // folder row pointing at local is fine to display either way — the
    // FileBrowser just shows the local icon.
    if (backend === 'local') return true
    return false
  }

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
  const orphanFolderIds: string[] = []
  for (const m of metadataResult.data ?? []) {
    const name = (m.path as string).split('/').pop() ?? (m.path as string)
    const kind = (m.kind as 'file' | 'folder') ?? 'file'
    let backend = m.backend as Backend
    // Self-heal orphan folder rows: a folder marked for a backend whose
    // integration is gone (e.g. drive folder rows left behind when an old
    // bulk migration didn't flip folders before the user disconnected drive)
    // would otherwise display the icon of a disconnected backend forever.
    // Display it as supabase here and queue an UPDATE to clean the row.
    if (kind === 'folder' && !backendIsLive(backend)) {
      orphanFolderIds.push(m.id as string)
      backend = 'supabase'
    }
    metadataByName.set(name, {
      id: m.id as string,
      backend,
      kind,
      size: Number(m.size_bytes ?? 0),
      mtime: (m.backend_mtime as string | null) ?? null,
    })
  }
  if (orphanFolderIds.length > 0) {
    // Best-effort cleanup. Failure just means we'll re-detect and re-attempt
    // on the next listing — display is already self-healed in-memory.
    void admin
      .from('files')
      .update({ backend: 'supabase', backend_ref: null })
      .in('id', orphanFolderIds)
      .then(({ error }) => {
        if (error) console.warn('[files] orphan folder cleanup failed', error)
      })
  }

  // Zombie-bucket guard. A cross-provider migration moves a metadata row to
  // a new path AND deletes the source bucket object — but if that delete
  // fails silently, the bucket still returns the item at its *old* location.
  // That would re-surface the file in the source folder even though the
  // authoritative metadata row has moved elsewhere. For each bucket entry,
  // if there's NO metadata row at `{currentPath}/{name}` but there IS a row
  // whose path ends with that name elsewhere, treat the bucket entry as
  // stale and skip it in the listing.
  const bucketNames = (listResult.data ?? [])
    .map(it => it.name)
    .filter(n => n !== '.keep')
  const zombieNames = new Set<string>()
  if (bucketNames.length > 0) {
    const expectedPaths = bucketNames.map(n => (path ? `${path}/${n}` : n))
    const { data: ownedRows, error: ownedError } = await admin
      .from('files')
      .select('path')
      .eq('workspace_id', workspaceId)
      .in('path', expectedPaths)
    if (ownedError) {
      console.warn('[files] zombie guard query failed', ownedError)
    } else {
      const ownedHere = new Set((ownedRows ?? []).map(r => r.path as string))
      // One query per candidate name: is there a row *elsewhere* whose
      // basename matches? We deliberately scope with `%/{name}` + equality
      // so 'A' doesn't accidentally match 'BA' or 'BA/x'.
      for (let i = 0; i < bucketNames.length; i++) {
        const name = bucketNames[i]!
        const expected = expectedPaths[i]!
        if (ownedHere.has(expected)) continue // row lives at this location → legit
        const meta = metadataByName.get(name)
        if (meta) continue // caught by the in-scope metadata loop → legit
        const { data: elsewhere } = await admin
          .from('files')
          .select('id')
          .eq('workspace_id', workspaceId)
          .or(`path.eq.${name},path.like.%/${name}`)
          .neq('path', expected)
          .limit(1)
        if (elsewhere && elsewhere.length > 0) zombieNames.add(name)
      }
    }
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
    if (zombieNames.has(name)) continue // stale source left behind by a failed delete

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

  // Manual positioning only: ranked items (the user's drag order) go first in
  // rank order; unranked items keep their bucket arrival order. No alphabetical
  // fallback — the client mirrors this exact policy.
  const orderedNames: string[] = orderResult.data?.ordered_names ?? []
  if (orderedNames.length) {
    const rank = new Map<string, number>()
    orderedNames.forEach((n, i) => rank.set(n, i))
    const byRank = <T extends { name: string }>(a: T, b: T) => {
      const ra = rank.get(a.name)
      const rb = rank.get(b.name)
      if (ra === undefined && rb === undefined) return 0
      if (ra === undefined) return 1
      if (rb === undefined) return -1
      return ra - rb
    }
    folders.sort(byRank)
    files.sort(byRank)
  }

  return { files, folders, order: orderedNames }
})
