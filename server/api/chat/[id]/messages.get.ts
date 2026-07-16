import type { UIMessage } from 'ai'
import { serverSupabaseClient } from '#supabase/server'
import { resolveAuthedGeneralChat, type GeneralChatMessageRow } from '~~/server/utils/chat/generalChat'

export default defineEventHandler(async (event) => {
  const chatId = getRouterParam(event, 'id') ?? ''
  const { chat } = await resolveAuthedGeneralChat(event, chatId)
  const supabase = await serverSupabaseClient(event) as unknown as { from: (table: string) => any }

  const { data, error } = await supabase
    .from('general_chat_messages')
    .select('id, chat_id, workspace_id, role, content, parts, metadata, created_at')
    .eq('chat_id', chat.id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[general-chat] message load failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load chat history.' })
  }

  return ((data ?? []) as GeneralChatMessageRow[]).map((row): UIMessage => ({
    id: row.id,
    role: row.role,
    metadata: row.metadata,
    parts: Array.isArray(row.parts)
      ? row.parts
      : (row.content ? [{ type: 'text', text: row.content }] : []),
  }))
})
