import { ToolLoopAgent, createAgentUIStreamResponse, type UIMessage, type ToolSet } from 'ai'
import { createMCPClient } from '@ai-sdk/mcp'
import { serverSupabaseSession } from '#supabase/server'
import {
  resolveAuthedGeneralChat,
  textFromUIMessage,
  touchGeneralChat,
  upsertGeneralChatMessage,
} from '~~/server/utils/chat/generalChat'

// The in-built "general chat" agent (Vercel AI SDK). Standalone from the
// workspace Core orchestrator — a Claude-Code-style assistant for Polymux.
//
// Its capabilities come from the **Polymux MCP** (the Go server's /mcp endpoint,
// hosted/account mode): the chat is literally "an agent + the Polymux MCP",
// scoped to the user's account. The same MCP surface will later run locally
// against an embedded engine, with no change here.
//
// Model resolves through the Vercel AI Gateway (the AI SDK's default global
// provider): OIDC on Vercel, or AI_GATEWAY_API_KEY for local dev.
const INSTRUCTIONS = [
  'You are Polymux\'s built-in assistant.',
  'Polymux lets people run browser agents and build automated workflows.',
  'Your job is to SET THINGS UP FOR THE USER using your tools — do the work',
  'directly rather than telling them which buttons to click in the UI.',
  'Inspect their workspace with the read tools before acting, then use the',
  'setup tools to make the change. Confirm first only when the request is',
  'ambiguous or you would overwrite something. Never do destructive actions.',
  'Be concise and concrete. Format answers in Markdown.',
].join(' ')

export default defineEventHandler(async (event) => {
  const { messages, chatId } = await readBody<{ messages: UIMessage[]; chatId?: string }>(event)
  if (!Array.isArray(messages)) {
    setResponseStatus(event, 400)
    return { error: 'messages required' }
  }
  if (!chatId) {
    setResponseStatus(event, 400)
    return { error: 'chatId required' }
  }

  // Resolve the chat's workspace so the MCP tools are scoped to it.
  const { user, chat } = await resolveAuthedGeneralChat(event, chatId)
  const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')
  if (latestUserMessage) {
    await upsertGeneralChatMessage(event, chat, latestUserMessage, user.sub)
  }

  const cfg = useRuntimeConfig()
  const serverUrl = cfg.public.serverUrl as string
  const session = await serverSupabaseSession(event).catch(() => null)
  const token = session?.access_token ?? ''

  // Connect to the Polymux MCP (hosted mode) for the agent's tools, scoped to
  // the acting user (JWT → RLS) and the chat's workspace. If the MCP is
  // unreachable or the chat has no workspace, fall back to a plain chat.
  let tools: ToolSet | undefined
  let mcp: Awaited<ReturnType<typeof createMCPClient>> | null = null
  if (serverUrl && token && chat.workspace_id) {
    try {
      mcp = await createMCPClient({
        transport: {
          type: 'http',
          url: `${serverUrl}/mcp`,
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Polymux-Workspace': chat.workspace_id,
            'X-Polymux-User': user.sub ?? '',
          },
        },
      })
      tools = await mcp.tools() as unknown as ToolSet
    }
    catch {
      tools = undefined
    }
  }

  const agent = new ToolLoopAgent({
    model: 'anthropic/claude-sonnet-4.6',
    instructions: INSTRUCTIONS,
    tools,
  })

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ responseMessage, isAborted }) => {
      try {
        if (!isAborted && responseMessage.role === 'assistant') {
          await upsertGeneralChatMessage(event, chat, responseMessage, user.sub)
        }
        if (latestUserMessage) {
          await touchGeneralChat(event, chat, textFromUIMessage(latestUserMessage))
        }
      }
      finally {
        await mcp?.close()
      }
    },
  })
})
