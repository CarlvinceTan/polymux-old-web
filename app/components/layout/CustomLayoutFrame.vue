<script setup lang="ts">
import { buildLayoutSdkSource } from '~/composables/integrations/layoutBridge'

// Sandboxed iframe that renders a custom-layout's authored body inside a
// TabPanel slot. The body is fetched from
// `/api/workspaces/[workspaceId]/integrations/by-id/[wiId]/layout`, then
// written into the iframe via `srcdoc`.
//
// Sandbox: `allow-scripts` only — NOT `allow-same-origin`. JS in the layout
// runs in a null origin and cannot read cookies, localStorage, or call
// authenticated Polymux endpoints directly. To bridge data back, we inject
// a tiny SDK at the top of every srcdoc that exposes `window.polymux` with
// postMessage RPC. The parent component (this file) holds the authenticated
// session and dispatches whitelisted calls on behalf of the iframe.

interface LayoutResponse {
  workspace_integration_id: string
  provider: string
  name: string
  tab_label: string
  target_section: string
  body: string
  updated_at: string
}

const props = defineProps<{
  workspaceIntegrationId: string
}>()

const { currentWorkspace } = useWorkspaces()
const { t } = useI18n()
const iframeEl = ref<HTMLIFrameElement | null>(null)

const layoutKey = computed(() => `custom-layout:${currentWorkspace.value?.id}:${props.workspaceIntegrationId}`)
const { data, pending, error, refresh } = useAsyncData<LayoutResponse | null>(
  layoutKey,
  async () => {
    const wsId = currentWorkspace.value?.id
    if (!wsId) return null
    return await $fetch<LayoutResponse>(
      `/api/workspaces/${wsId}/integrations/by-id/${props.workspaceIntegrationId}/layout`,
    )
  },
  {
    watch: [() => currentWorkspace.value?.id, () => props.workspaceIntegrationId],
    default: () => null,
  },
)

// Build the SDK script (with the workspace id baked in so the iframe can
// know its scope without an extra round trip). Each iframe instance gets a
// fresh SDK because the workspace id may differ.
const sdkSource = computed(() => buildLayoutSdkSource({
  workspaceId: currentWorkspace.value?.id ?? '',
  workspaceName: currentWorkspace.value?.name ?? '',
}))

// Wrap the author's body in a minimal HTML document so they don't have to
// write <html>/<body> themselves. The SDK is ALWAYS injected so authors
// always have `window.polymux` available regardless of whether they chose
// to ship a full document or just body content.
const srcdoc = computed(() => {
  const body = data.value?.body ?? ''
  const sdkTag = `<script>${sdkSource.value}<\/script>`
  const trimmed = body.trimStart().toLowerCase()
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    // Author provided a full document. Inject the SDK before </head> if
    // present, else before <body>, else prepend.
    if (body.includes('</head>')) return body.replace('</head>', `${sdkTag}</head>`)
    const bodyOpen = body.match(/<body[^>]*>/i)
    if (bodyOpen?.index !== undefined) {
      const insertAt = bodyOpen.index + bodyOpen[0].length
      return body.slice(0, insertAt) + sdkTag + body.slice(insertAt)
    }
    return sdkTag + body
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${sdkTag}
    <style>
      :root { color-scheme: light; }
      html, body { margin: 0; padding: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #0a0a0a; background: #fff; }
      body { padding: 1rem 1.25rem; }
    </style>
  </head>
  <body>${body}</body>
</html>`
})

// Method whitelist for the iframe → parent bridge. Each method maps to an
// async handler that runs in the parent with the user's authenticated
// session. New methods can be added here without changing the SDK shape.
async function dispatchRpc(method: string, params: unknown): Promise<unknown> {
  const wsId = currentWorkspace.value?.id
  if (!wsId) throw new Error('No active workspace.')
  switch (method) {
    case 'workspace.get':
      return { id: wsId, name: currentWorkspace.value?.name ?? '' }
    case 'files.list': {
      const p = (params ?? {}) as { folder_id?: string }
      const query: Record<string, string> = {}
      if (p.folder_id) query.folder_id = p.folder_id
      return await $fetch(`/api/workspaces/${wsId}/files`, { method: 'GET', query })
    }
    case 'workflows.list':
      // Workflows are workspace-scoped via RLS; the marketplace publish
      // surface uses the same endpoint (it's authored-by-the-user-filtered
      // there, but here it's all workspace workflows the user can see).
      return await $fetch('/api/marketplace/my-workflows', { method: 'GET' })
    case 'artifacts.list': {
      const p = (params ?? {}) as { workflow_id?: string }
      if (!p.workflow_id) throw new Error('artifacts.list: workflow_id is required.')
      return await $fetch(`/api/workflows/${p.workflow_id}/artifacts`, { method: 'GET' })
    }
    default:
      throw new Error(`Unknown method: ${method}`)
  }
}

function onMessage(evt: MessageEvent) {
  const iframe = iframeEl.value
  if (!iframe) return
  if (evt.source !== iframe.contentWindow) return
  const data = evt.data as { __polymux?: string, requestId?: unknown, method?: unknown, params?: unknown } | null
  if (!data || data.__polymux !== 'rpc') return
  const requestId = data.requestId
  const method = typeof data.method === 'string' ? data.method : ''
  if (typeof requestId !== 'number') return
  dispatchRpc(method, data.params).then(
    (result) => {
      iframe.contentWindow?.postMessage({ __polymux: 'rpc:response', requestId, result }, '*')
    },
    (err: Error) => {
      iframe.contentWindow?.postMessage({ __polymux: 'rpc:response', requestId, error: err?.message ?? String(err) }, '*')
    },
  )
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div v-if="pending && !data" class="flex flex-1 items-center justify-center text-body-md text-neutral-500">
      {{ t('layout.loading') }}
    </div>
    <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <p class="text-body-md text-neutral-700">
        {{ t('layout.loadFailed') }}
      </p>
      <button
        type="button"
        class="rounded-md bg-neutral-950 px-3 py-1.5 text-label-md font-medium text-white transition-colors hover:bg-neutral-800"
        @click="refresh()"
      >
        {{ t('layout.retry') }}
      </button>
    </div>
    <iframe
      v-else
      ref="iframeEl"
      :key="data?.updated_at"
      :title="data?.tab_label ?? 'Custom layout'"
      :srcdoc="srcdoc"
      sandbox="allow-scripts"
      class="min-h-0 min-w-0 flex-1 border-0 bg-white"
    />
  </div>
</template>
