import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

// Shared helpers for session-scoped routes (currently used by /api/sessions/[id]/artifacts/*).
//
// Session membership is implicit: a user can read a session iff they're a
// member of the workspace that owns it. The session row carries the workspace
// id; one round-trip joins both checks.

export function resolveSessionId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Session ID is required.' })
  }
  return id
}

export function resolveArtifactId(event: H3Event): string {
  const aid = getRouterParam(event, 'aid')
  if (!aid) {
    throw createError({ statusCode: 400, statusMessage: 'Artifact ID is required.' })
  }
  return aid
}

export interface SessionAccess {
  sessionId: string
  workspaceId: string
}

// assertSessionMember loads the session row + verifies the user is a workspace
// member. Returns the workspace id so callers don't need a second query for
// permission checks against workspace-scoped helpers (effective_file_permission, etc.).
export async function assertSessionMember(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<SessionAccess> {
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('id, workspace_id')
    .eq('id', sessionId)
    .single()
  if (sessionErr || !session?.workspace_id) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found.' })
  }

  const { data: member, error: memberErr } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', session.workspace_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (memberErr || !member) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this session\'s workspace.' })
  }

  return { sessionId: session.id as string, workspaceId: session.workspace_id as string }
}
