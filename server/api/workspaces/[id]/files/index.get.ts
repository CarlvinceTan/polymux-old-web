import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  type GrantLevel,
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'

type Backend = 'google-drive' | 'local'

// GET /api/workspaces/[id]/files?path=reports
// Lists files and folders under a logical path. Applies the per-path
// effective-permission filter — entries the caller cannot read are omitted.
//
// The `files` metadata table is the source of truth: each row points at the
// backend that holds its bytes (Google Drive or local). The browser renders
// the per-row provider icon directly from the row's `backend` column.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const query = getQuery(event)
  const path = normalizePath(query.path)

  const supabase = await serverSupabaseClient(event)

  const role = await assertMembership(supabase, workspaceId, user.sub)

  const admin = serverSupabaseServiceRole(event)

  const childPattern = path === '' ? '%' : `${path}/%`
  const grandchildPattern = path === '' ? '%/%' : `${path}/%/%`

  const [permsResult, orderResult, metadataResult, descendantsResult, integrationsResult] = await Promise.all([
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
    admin
      .from('files')
      .select('id, path, kind, backend, size_bytes, backend_mtime, created_at')
      .eq('workspace_id', workspaceId)
      .like('path', childPattern)
      .not('path', 'like', grandchildPattern),
    // Everything strictly *inside* the direct-child folders (depth ≥ current+2).
    // Used to compute each child folder's recursive size and whether it's empty
    // — folders have no size_bytes of their own, so we sum their descendants.
    admin
      .from('files')
      .select('path, kind, size_bytes, backend_mtime')
      .eq('workspace_id', workspaceId)
      .like('path', grandchildPattern),
    admin
      .from('workspace_integrations')
      .select('provider')
      .eq('workspace_id', workspaceId),
  ])

  // Backends that are currently usable for this workspace. Folder rows
  // pointing at a backend that's no longer connected are orphans (e.g. drive
  // disconnected before its folder rows were flipped) — we self-heal them
  // below to 'local' so they at least render with a sensible icon.
  const installedProviders = new Set<string>(
    (integrationsResult.data ?? []).map(r => r.provider as string),
  )
  function backendIsLive(backend: Backend): boolean {
    if (backend === 'google-drive') return installedProviders.has('google-drive')
    return true // 'local' always renders
  }

  if (permsResult.error) {
    console.error('[files] permissions error', permsResult.error)
    throw createError({ statusCode: 500, statusMessage: 'Permission check failed.' })
  }
  if (metadataResult.error) {
    console.error('[files] metadata layer error', metadataResult.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list files.' })
  }

  interface MetaEntry {
    id: string
    backend: Backend
    kind: 'file' | 'folder'
    size: number
    mtime: string | null
    createdAt: string | null
  }
  const metadataByName = new Map<string, MetaEntry>()
  const orphanFolderIds: string[] = []
  for (const m of metadataResult.data ?? []) {
    const name = (m.path as string).split('/').pop() ?? (m.path as string)
    const kind = (m.kind as 'file' | 'folder') ?? 'file'
    let backend = m.backend as Backend
    if (kind === 'folder' && !backendIsLive(backend)) {
      orphanFolderIds.push(m.id as string)
      backend = 'local'
    }
    metadataByName.set(name, {
      id: m.id as string,
      backend,
      kind,
      size: Number(m.size_bytes ?? 0),
      mtime: (m.backend_mtime as string | null) ?? null,
      createdAt: (m.created_at as string | null) ?? null,
    })
  }
  if (orphanFolderIds.length > 0) {
    void admin
      .from('files')
      .update({ backend: 'local', backend_ref: null })
      .in('id', orphanFolderIds)
      .then(({ error }) => {
        if (error) console.warn('[files] orphan folder cleanup failed', error)
      })
  }

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

  // For each direct-child folder (keyed by its top-level name under `path`),
  // total the size of its readable descendant files and note whether it has any
  // readable descendant at all (empty vs non-empty). Respects per-path
  // permissions so unreadable contents don't leak into size or the empty flag.
  const folderSizeByName = new Map<string, number>()
  const folderMtimeByName = new Map<string, string>()
  const nonEmptyFolderNames = new Set<string>()
  for (const row of descendantsResult.data ?? []) {
    const p = row.path as string
    if (evaluatePermission(p) === 'none') continue
    const rel = path === '' ? p : p.slice(path.length + 1)
    const firstSeg = rel.split('/')[0]
    if (!firstSeg) continue
    nonEmptyFolderNames.add(firstSeg)
    if ((row.kind as string) !== 'folder') {
      folderSizeByName.set(firstSeg, (folderSizeByName.get(firstSeg) ?? 0) + Number(row.size_bytes ?? 0))
    }
    // Track the most recent descendant mtime so the folder's "Date modified"
    // reflects when its contents last changed (Finder-style).
    const mtime = row.backend_mtime as string | null
    if (mtime) {
      const cur = folderMtimeByName.get(firstSeg)
      if (!cur || mtime > cur) folderMtimeByName.set(firstSeg, mtime)
    }
  }

  const files: Array<{
    id: string
    name: string
    path: string
    size: number
    createdAt: string
    provider: Backend
  }> = []
  const folders: Array<{ name: string, path: string, provider: Backend, size: number, empty: boolean, createdAt: string }> = []

  for (const [name, meta] of metadataByName) {
    const logicalPath = path ? `${path}/${name}` : name
    if (evaluatePermission(logicalPath) === 'none') continue
    if (meta.kind === 'folder') {
      // Prefer the newest descendant mtime, then the folder's own backend mtime,
      // then its row creation time — so every folder shows a date.
      const createdAt = folderMtimeByName.get(name) ?? meta.mtime ?? meta.createdAt ?? ''
      folders.push({
        name,
        path: logicalPath,
        provider: meta.backend,
        size: folderSizeByName.get(name) ?? 0,
        empty: !nonEmptyFolderNames.has(name),
        createdAt,
      })
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
  // rank order; unranked items keep their arrival order. No alphabetical
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
