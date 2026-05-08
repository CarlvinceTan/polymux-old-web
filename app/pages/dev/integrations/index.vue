<script setup lang="ts">
definePageMeta({ layout: 'dev' })
// TODO(supabase): replace useState with /api/dev/integrations once auth is wired.
useHead({ title: 'Integrations — Polymux Developers' })

interface DevIntegration {
  id: string
  name: string
  type: 'webhook' | 'oauth' | 'tool'
  scopes: string[]
  webhookUrl?: string
  apiKey: string
  apiSecret: string
  createdAt: string
}

const integrations = useState<DevIntegration[]>('dev-integrations', () => [])
const showBuilder = ref(false)

const toast = useState<{ msg: string; visible: boolean }>('dev-toast', () => ({ msg: '', visible: false }))
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toast.value = { msg, visible: true }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = { msg: '', visible: false }
  }, 2500)
}

function onCreated(i: Omit<DevIntegration, 'id' | 'createdAt'>) {
  integrations.value.push({
    ...i,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
  })
  showToast(`${i.name} created`)
}

async function copyKey(integration: DevIntegration) {
  try {
    await navigator.clipboard.writeText(integration.apiKey)
    showToast('API Key copied')
  }
  catch {
    showToast('Could not access clipboard')
  }
}

function removeIntegration(id: string) {
  integrations.value = integrations.value.filter(i => i.id !== id)
  showToast('Integration removed')
}
</script>

<template>
  <div class="bg-white">
    <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header class="flex flex-col gap-4 border-b border-neutral-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Integrations
          </p>
          <h1 class="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            Your integrations
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-relaxed text-neutral-600">
            Build, test, and publish integrations on the Polymux platform. Keys are scoped per integration and stored in your Vault.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:self-end"
          @click="showBuilder = true"
        >
          <UIcon name="i-heroicons-plus-20-solid" class="size-4" />
          New integration
        </button>
      </header>

      <div
        v-if="integrations.length === 0"
        class="mt-12 flex flex-col items-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 px-6 py-16 text-center"
      >
        <span class="inline-flex size-12 items-center justify-center rounded-full bg-white shadow-sm">
          <UIcon name="i-heroicons-rocket-launch-20-solid" class="size-6 text-neutral-500" />
        </span>
        <div class="max-w-sm">
          <h2 class="text-base font-semibold text-neutral-950">
            No integrations yet
          </h2>
          <p class="mt-1 text-sm text-neutral-600">
            Create your first integration in under a minute. Mock keys are generated client-side for testing.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          @click="showBuilder = true"
        >
          <UIcon name="i-heroicons-plus-20-solid" class="size-4" />
          Create your first
        </button>
      </div>

      <ul v-else class="mt-10 space-y-3">
        <li v-for="i in integrations" :key="i.id">
          <DevIntegrationListItem
            :integration="i"
            @copy-key="copyKey(i)"
            @remove="removeIntegration(i.id)"
          />
        </li>
      </ul>
    </div>

    <DevIntegrationBuilderModal
      v-if="showBuilder"
      @close="showBuilder = false"
      @created="onCreated"
    />

    <div
      class="pointer-events-none fixed bottom-6 right-6 z-50 transition-all duration-200"
      :class="toast.visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'"
    >
      <div class="pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        <UIcon name="i-heroicons-check-circle-20-solid" class="size-4 text-emerald-400" />
        {{ toast.msg }}
      </div>
    </div>
  </div>
</template>
