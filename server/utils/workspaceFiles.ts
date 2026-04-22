import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

// Shared helpers for the /api/workspaces/[id]/files/* routes.
//
// Path conventions:
// - `path` is the workspace-relative logical path. No leading or trailing slash.
// - `''` is the workspace root.
// - Storage bucket object name is `{workspaceId}/main/{path}` for the `supabase` backend.

export const STORAGE_BUCKET = 'workspace-files'

export type GrantLevel = 'read' | 'write' | 'none'

export function normalizePath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\\+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

export function parentOf(path: string): string {
  if (!path) return ''
  const idx = path.lastIndexOf('/')
  return idx < 0 ? '' : path.slice(0, idx)
}

export function basenameOf(path: string): string {
  if (!path) return ''
  const idx = path.lastIndexOf('/')
  return idx < 0 ? path : path.slice(idx + 1)
}

export function storageKey(workspaceId: string, path: string): string {
  return `${workspaceId}/main/${path}`
}

export function storagePrefix(workspaceId: string, path: string): string {
  const base = `${workspaceId}/main/`
  return path ? `${base}${path}/` : base
}

export function sanitizeSegment(name: string): string {
  const t = name.trim().replace(/\0/g, '')
  if (!t) return ''
  return t
    .replace(/[/\\]+/g, '-')
    .replace(/^\.+$/, '_')
    .slice(0, 240)
}

export async function assertMembership(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()
  if (error || !data) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  }
  return data.role
}

export async function effectivePermission(
  supabase: SupabaseClient,
  workspaceId: string,
  path: string,
  userId: string,
): Promise<GrantLevel> {
  const { data, error } = await supabase.rpc('effective_file_permission', {
    p_workspace_id: workspaceId,
    p_path: path,
    p_user_id: userId,
  })
  if (error) {
    console.error('[files] effective_file_permission error', error)
    throw createError({ statusCode: 500, statusMessage: 'Permission check failed.' })
  }
  return (data ?? 'none') as GrantLevel
}

export async function requireRead(
  supabase: SupabaseClient,
  workspaceId: string,
  path: string,
  userId: string,
) {
  const level = await effectivePermission(supabase, workspaceId, path, userId)
  if (level === 'none') {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this path.' })
  }
}

export async function requireWrite(
  supabase: SupabaseClient,
  workspaceId: string,
  path: string,
  userId: string,
) {
  const level = await effectivePermission(supabase, workspaceId, path, userId)
  if (level !== 'write') {
    throw createError({ statusCode: 403, statusMessage: 'You do not have write access to this path.' })
  }
}

export function resolveWorkspaceId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }
  return id
}
