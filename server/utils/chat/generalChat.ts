import type { H3Event } from 'h3'
import type { UIMessage } from 'ai'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { assertMembership } from '~~/server/utils/workspace/workspaceFiles'

export interface GeneralChatRow {
  id: string
  workspace_id: string
  title: string
  archived_at?: string | null
}

export interface GeneralChatMessageRow {
  id: string
  chat_id: string
  workspace_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parts: UIMessage['parts']
  metadata?: UIMessage['metadata']
  created_at: string
}

export function textFromUIMessage(message: Pick<UIMessage, 'parts'>): string {
  return (message.parts ?? [])
    .filter((part): part is { type: 'text'; text: string } =>
      part.type === 'text' && typeof (part as { text?: unknown }).text === 'string',
    )
    .map(part => part.text)
    .join('')
}

export function titleFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return 'New chat'
  return compact.length > 52 ? `${compact.slice(0, 49).trimEnd()}...` : compact
}

export async function resolveAuthedGeneralChat(event: H3Event, chatId: string) {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }
  if (!chatId) {
    throw createError({ statusCode: 400, statusMessage: 'Chat ID is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('chats')
    .select('id, workspace_id, title, archived_at')
    .eq('id', chatId)
    .maybeSingle()

  if (error) {
    console.error('[general-chat] chat lookup failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load chat.' })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
  }

  const chat = data as GeneralChatRow
  await assertMembership(supabase, chat.workspace_id, user.sub)
  return { user, chat }
}

export function adminClient(event: H3Event) {
  return serverSupabaseServiceRole(event) as unknown as { from: (table: string) => any }
}

export async function upsertGeneralChatMessage(
  event: H3Event,
  chat: GeneralChatRow,
  message: UIMessage,
  createdBy: string,
) {
  const admin = adminClient(event)
  const content = textFromUIMessage(message)
  const { error } = await admin
    .from('general_chat_messages')
    .upsert({
      id: message.id,
      chat_id: chat.id,
      workspace_id: chat.workspace_id,
      role: message.role,
      content,
      parts: message.parts ?? [],
      metadata: message.metadata ?? {},
      created_by: createdBy,
    }, { onConflict: 'id' })

  if (error) {
    console.error('[general-chat] message upsert failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save chat message.' })
  }
}

export async function touchGeneralChat(
  event: H3Event,
  chat: GeneralChatRow,
  firstUserText: string,
) {
  const admin = adminClient(event)
  const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() }
  if (!chat.title?.trim()) patch.title = titleFromPrompt(firstUserText)

  const { error } = await admin
    .from('chats')
    .update(patch)
    .eq('id', chat.id)
    .eq('workspace_id', chat.workspace_id)

  if (error) {
    console.error('[general-chat] chat touch failed', error)
  }
}
