<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/wallet/useMarketplace'

interface MyWorkflow {
  id: string
  name: string
  description?: string | null
  latest_version: { id: string, version: number, change_summary?: string | null, created_at: string } | null
}

interface CatalogItem {
  id: string
  dbId: string
  slug: string
  name: string
  description: string
  category: ItemCategory
  isFirstParty: boolean
}

interface IntegrationPublishResponse {
  ok: true
  integration_id: string
  version_id: string
  slug: string
  version: string
  signing_secret: string
}

interface SimplePublishResponse {
  ok: true
  integration_id: string
  slug: string
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'published': []
}>()

type Step = 'kind' | 'integration' | 'workflow' | 'plugin' | 'secret'

const { t } = useI18n()
const toast = useAppToast()
const router = useRouter()
const user = useSupabaseUser()

const step = ref<Step>('kind')
const submitting = ref(false)

// Integration form
const manifestUrl = ref('')
const secretResult = ref<IntegrationPublishResponse | null>(null)
const secretCopied = ref(false)

// Workflow form
const wfName = ref('')
const wfDescription = ref('')
const wfTagsCsv = ref('')
const wfIconUrl = ref('')
const wfWorkflowId = ref('')
const wfWorkflowVersionId = ref('')

// Plugin form
const plName = ref('')
const plDescription = ref('')
const plTagsCsv = ref('')
const plIconUrl = ref('')
const plItemIds = ref<string[]>([])

const KINDS = computed(() => ([
  {
    value: 'integration' as const,
    title: t('integrations.editorNewIntegration'),
    description: t('integrations.editorNewIntegrationDesc'),
    icon: 'i-heroicons-link-20-solid',
  },
  {
    value: 'workflow' as const,
    title: t('integrations.editorNewWorkflow'),
    description: t('integrations.editorNewWorkflowDesc'),
    icon: 'i-heroicons-bolt-20-solid',
  },
  {
    value: 'plugin' as const,
    title: t('integrations.editorNewPlugin'),
    description: t('integrations.editorNewPluginDesc'),
    icon: 'i-heroicons-cube-transparent-20-solid',
  },
]))

// ---- Workflow data ------------------------------------------------------

const { data: workflows } = useAsyncData<MyWorkflow[]>(
  'editor-modal-workflows',
  async () => await $fetch<MyWorkflow[]>('/api/marketplace/my-workflows'),
  { default: () => [], lazy: true, immediate: false },
)

const selectedWorkflow = computed(() =>
  (workflows.value ?? []).find(w => w.id === wfWorkflowId.value) ?? null,
)

watch(wfWorkflowId, (id) => {
  const wf = (workflows.value ?? []).find(w => w.id === id)
  if (wf) {
    if (!wfName.value) wfName.value = wf.name
    if (!wfDescription.value && wf.description) wfDescription.value = wf.description
    if (wf.latest_version && !wfWorkflowVersionId.value) {
      wfWorkflowVersionId.value = wf.latest_version.id
    }
  }
})

// Slugify any text into a marketplace-safe segment (lowercase, hyphenated,
// alnum-only). Returns '' when nothing slug-able remains.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const authorHandle = computed(() => {
  const email = user.value?.email ?? ''
  const local = email.split('@')[0] ?? ''
  return slugify(local)
})

const wfSlug = computed(() => {
  const namePart = slugify(wfName.value)
  if (!namePart) return ''
  return authorHandle.value ? `${authorHandle.value}/${namePart}` : namePart
})

const plSlug = computed(() => {
  const namePart = slugify(plName.value)
  if (!namePart) return ''
  return authorHandle.value ? `${authorHandle.value}/${namePart}` : namePart
})

// ---- Plugin catalog -----------------------------------------------------

const { data: catalog } = useAsyncData<CatalogItem[]>(
  'editor-modal-catalog',
  async () => await $fetch<CatalogItem[]>('/api/marketplace/integrations'),
  { default: () => [], lazy: true, immediate: false },
)

const bundleable = computed(() =>
  (catalog.value ?? []).filter(i => i.category !== 'plugin'),
)

function togglePluginItem(id: string) {
  const idx = plItemIds.value.indexOf(id)
  if (idx === -1) plItemIds.value.push(id)
  else plItemIds.value.splice(idx, 1)
}

// ---- Lifecycle ----------------------------------------------------------

function reset() {
  step.value = 'kind'
  submitting.value = false
  manifestUrl.value = ''
  secretResult.value = null
  secretCopied.value = false
  wfName.value = ''
  wfDescription.value = ''
  wfTagsCsv.value = ''
  wfIconUrl.value = ''
  wfWorkflowId.value = ''
  wfWorkflowVersionId.value = ''
  plName.value = ''
  plDescription.value = ''
  plTagsCsv.value = ''
  plIconUrl.value = ''
  plItemIds.value = []
}

function close() {
  emit('update:open', false)
}

// Reset to first step every time the modal closes — opening fresh shouldn't
// remember a draft state, especially the one-shot signing secret.
watch(() => props.open, (open) => {
  if (!open) {
    setTimeout(reset, 200) // wait for leave transition before clearing
  }
})

// Lazy-load only the data each step needs.
watch(step, async (newStep) => {
  if (newStep === 'workflow' && (workflows.value?.length ?? 0) === 0) {
    await refreshNuxtData('editor-modal-workflows')
  }
  if (newStep === 'plugin' && (catalog.value?.length ?? 0) === 0) {
    await refreshNuxtData('editor-modal-catalog')
  }
})

function pickKind(k: 'integration' | 'workflow' | 'plugin') {
  step.value = k
}

function backToKind() {
  step.value = 'kind'
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) close()
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

// ---- Submit handlers ----------------------------------------------------

async function submitIntegration() {
  if (!manifestUrl.value || submitting.value) return
  submitting.value = true
  try {
    const res = await $fetch<IntegrationPublishResponse>('/api/marketplace/integrations', {
      method: 'POST',
      body: { manifest_url: manifestUrl.value.trim() },
    })
    secretResult.value = res
    step.value = 'secret'
    emit('published')
  }
  catch (err) {
    toast.show(extractError(err), 'error')
  }
  finally {
    submitting.value = false
  }
}

async function submitWorkflow() {
  if (!wfSlug.value || !wfWorkflowId.value || !wfWorkflowVersionId.value || !wfName.value || submitting.value) return
  submitting.value = true
  try {
    const tags = wfTagsCsv.value.split(',').map(s => s.trim()).filter(Boolean)
    const res = await $fetch<SimplePublishResponse>('/api/marketplace/workflows', {
      method: 'POST',
      body: {
        slug: wfSlug.value,
        workflow_id: wfWorkflowId.value,
        workflow_version_id: wfWorkflowVersionId.value,
        name: wfName.value.trim(),
        description: wfDescription.value.trim() || undefined,
        tags,
        icon_url: wfIconUrl.value.trim() || undefined,
      },
    })
    emit('published')
    close()
    router.push(`/integrations/publish/${res.integration_id}`)
  }
  catch (err) {
    toast.show(extractError(err), 'error')
  }
  finally {
    submitting.value = false
  }
}

async function submitPlugin() {
  if (!plSlug.value || !plName.value || plItemIds.value.length === 0 || submitting.value) return
  submitting.value = true
  try {
    const tags = plTagsCsv.value.split(',').map(s => s.trim()).filter(Boolean)
    const idMap = new Map<string, string>()
    for (const c of catalog.value ?? []) idMap.set(c.id, c.dbId)
    const items = plItemIds.value
      .map(id => ({ child_integration_id: idMap.get(id) }))
      .filter((it): it is { child_integration_id: string } => typeof it.child_integration_id === 'string')
    const res = await $fetch<{ ok: true, integration_id: string }>('/api/marketplace/plugins', {
      method: 'POST',
      body: {
        slug: plSlug.value,
        name: plName.value.trim(),
        description: plDescription.value.trim() || undefined,
        tags,
        icon_url: plIconUrl.value.trim() || undefined,
        items,
      },
    })
    emit('published')
    close()
    router.push(`/integrations/publish/${res.integration_id}`)
  }
  catch (err) {
    toast.show(extractError(err), 'error')
  }
  finally {
    submitting.value = false
  }
}

async function copySecret() {
  if (!secretResult.value) return
  await navigator.clipboard.writeText(secretResult.value.signing_secret)
  secretCopied.value = true
  setTimeout(() => { secretCopied.value = false }, 2000)
}

function openSecretListing() {
  if (!secretResult.value) return
  const id = secretResult.value.integration_id
  close()
  router.push(`/integrations/publish/${id}`)
}

function extractError(err: unknown): string {
  return (err as { statusMessage?: string })?.statusMessage
    ?? (err as Error)?.message
    ?? 'Publish failed'
}

const stepTitle = computed(() => {
  switch (step.value) {
    case 'kind': return t('integrations.editorPickKind')
    case 'integration': return t('integrations.editorNewIntegration')
    case 'workflow': return t('integrations.editorNewWorkflow')
    case 'plugin': return t('integrations.editorNewPlugin')
    case 'secret': return t('integrations.editorPublished')
  }
  return ''
})
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          class="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          @click="close"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="open"
              class="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              style="max-height: 90svh"
              role="dialog"
              aria-modal="true"
              :aria-label="stepTitle"
              @click.stop
            >
              <button
                type="button"
                class="absolute right-4 top-4 z-10 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                :aria-label="t('common.close')"
                @click="close"
              >
                <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
              </button>

              <header class="flex items-center gap-3 px-6 pt-6 pb-4">
                <button
                  v-if="step !== 'kind' && step !== 'secret'"
                  type="button"
                  class="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
                  :aria-label="t('integrations.editorBack')"
                  @click="backToKind"
                >
                  <UIcon name="i-heroicons-arrow-left-20-solid" class="size-4" />
                </button>
                <h2 class="min-w-0 flex-1 truncate pr-8 text-title-sm font-semibold tracking-tight text-neutral-950">
                  {{ stepTitle }}
                </h2>
              </header>

              <div class="h-px bg-neutral-100" />

              <div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
                <!-- Kind picker -->
                <div v-if="step === 'kind'" class="grid gap-3" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))">
                  <button
                    v-for="k in KINDS"
                    :key="k.value"
                    type="button"
                    class="ghost-panel group flex flex-col gap-3 rounded-xl bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
                    @click="pickKind(k.value)"
                  >
                    <div class="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-neutral-950 group-hover:text-white">
                      <UIcon :name="k.icon" class="size-5" />
                    </div>
                    <div>
                      <p class="text-sm font-semibold leading-tight text-neutral-950">
                        {{ k.title }}
                      </p>
                      <p class="mt-1 text-label-md leading-relaxed text-neutral-500">
                        {{ k.description }}
                      </p>
                    </div>
                  </button>
                </div>

                <!-- Integration form -->
                <form v-else-if="step === 'integration'" class="flex flex-col gap-4" @submit.prevent="submitIntegration">
                  <p class="text-body-md text-neutral-500">
                    {{ t('integrations.editorNewIntegrationDesc') }}
                  </p>
                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorManifestUrl') }}</span>
                    <input
                      v-model="manifestUrl"
                      type="url"
                      required
                      placeholder="https://github.com/you/repo/raw/main/polymux.json"
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none transition-colors focus:border-neutral-950 placeholder:text-neutral-500"
                    >
                    <span class="text-label-md text-neutral-500">{{ t('integrations.editorManifestUrlHelp') }}</span>
                  </label>
                  <button
                    type="submit"
                    class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="!manifestUrl.trim() || submitting"
                  >
                    {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
                  </button>
                </form>

                <!-- Workflow form -->
                <form v-else-if="step === 'workflow'" class="flex flex-col gap-4" @submit.prevent="submitWorkflow">
                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorPickWorkflow') }}</span>
                    <select
                      v-model="wfWorkflowId"
                      required
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    >
                      <option value="" disabled>—</option>
                      <option v-for="wf in workflows ?? []" :key="wf.id" :value="wf.id">
                        {{ wf.name }}
                      </option>
                    </select>
                  </label>

                  <label v-if="selectedWorkflow" class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorPickWorkflowVersion') }}</span>
                    <select
                      v-model="wfWorkflowVersionId"
                      required
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    >
                      <option value="" disabled>—</option>
                      <option v-if="selectedWorkflow.latest_version" :value="selectedWorkflow.latest_version.id">
                        v{{ selectedWorkflow.latest_version.version }}
                        <template v-if="selectedWorkflow.latest_version.change_summary">
                          — {{ selectedWorkflow.latest_version.change_summary }}
                        </template>
                      </option>
                    </select>
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorName') }}</span>
                    <input
                      v-model="wfName"
                      type="text"
                      required
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    >
                  </label>

                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorSlug') }}</span>
                    <div
                      class="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-body-md"
                      :class="wfSlug ? 'text-neutral-950' : 'text-neutral-400'"
                    >
                      {{ wfSlug || t('integrations.editorSlugPreviewEmpty') }}
                    </div>
                    <span class="text-label-md text-neutral-500">{{ t('integrations.editorSlugAutoHelp') }}</span>
                  </div>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorDescription') }}</span>
                    <textarea
                      v-model="wfDescription"
                      rows="2"
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    />
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorTags') }}</span>
                    <input
                      v-model="wfTagsCsv"
                      type="text"
                      :placeholder="t('integrations.editorTagsPlaceholder')"
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    >
                  </label>

                  <button
                    type="submit"
                    class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="!wfSlug || !wfWorkflowId || !wfWorkflowVersionId || !wfName || submitting"
                  >
                    {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
                  </button>
                </form>

                <!-- Plugin form -->
                <form v-else-if="step === 'plugin'" class="flex flex-col gap-4" @submit.prevent="submitPlugin">
                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorName') }}</span>
                    <input
                      v-model="plName"
                      type="text"
                      required
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    >
                  </label>

                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorSlug') }}</span>
                    <div
                      class="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-body-md"
                      :class="plSlug ? 'text-neutral-950' : 'text-neutral-400'"
                    >
                      {{ plSlug || t('integrations.editorSlugPreviewEmpty') }}
                    </div>
                    <span class="text-label-md text-neutral-500">{{ t('integrations.editorSlugAutoHelp') }}</span>
                  </div>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorDescription') }}</span>
                    <textarea
                      v-model="plDescription"
                      rows="2"
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    />
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorTags') }}</span>
                    <input
                      v-model="plTagsCsv"
                      type="text"
                      :placeholder="t('integrations.editorTagsPlaceholder')"
                      class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
                    >
                  </label>

                  <div class="flex flex-col gap-2">
                    <span class="text-sm font-medium text-neutral-950">
                      {{ t('integrations.editorBundleItems') }}
                      <span v-if="plItemIds.length" class="ml-1 text-label-md text-neutral-500">({{ plItemIds.length }})</span>
                    </span>
                    <p v-if="!bundleable.length" class="text-label-md text-neutral-500">
                      {{ t('integrations.editorBundleNoItems') }}
                    </p>
                    <div v-else class="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-200 p-1">
                      <button
                        v-for="item in bundleable"
                        :key="item.id"
                        type="button"
                        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-50"
                        :class="{ 'bg-neutral-100': plItemIds.includes(item.id) }"
                        @click="togglePluginItem(item.id)"
                      >
                        <UIcon
                          :name="plItemIds.includes(item.id) ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-plus-circle'"
                          class="size-4 shrink-0"
                          :class="plItemIds.includes(item.id) ? 'text-neutral-950' : 'text-neutral-400'"
                        />
                        <span class="min-w-0 flex-1 truncate text-body-md text-neutral-950">{{ item.name }}</span>
                        <span class="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-label-md font-medium text-neutral-600">
                          {{ item.category }}
                        </span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="!plSlug || !plName || !plItemIds.length || submitting"
                  >
                    {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
                  </button>
                </form>

                <!-- Secret display (post-integration publish) -->
                <div v-else-if="step === 'secret' && secretResult" class="flex flex-col gap-4">
                  <div class="ghost-panel flex flex-col gap-1 rounded-xl bg-white p-4">
                    <p class="text-sm font-semibold text-neutral-950">
                      {{ secretResult.slug }}
                    </p>
                    <p class="text-label-md text-neutral-500">
                      {{ t('integrations.editorVersion', { version: secretResult.version }) }}
                    </p>
                  </div>

                  <div class="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p class="text-sm font-semibold text-amber-900">
                      {{ t('integrations.editorSigningSecret') }}
                    </p>
                    <p class="text-label-md text-amber-800">
                      {{ t('integrations.editorSigningSecretWarning') }}
                    </p>
                    <div class="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2">
                      <code class="min-w-0 flex-1 truncate font-mono text-body-md text-neutral-950">
                        {{ secretResult.signing_secret }}
                      </code>
                      <button
                        type="button"
                        class="shrink-0 rounded-md bg-neutral-950 px-2.5 py-1 text-label-md font-medium text-white transition-colors hover:bg-neutral-800"
                        @click="copySecret"
                      >
                        {{ secretCopied ? t('integrations.editorCopied') : t('integrations.editorCopy') }}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="self-end rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                    @click="openSecretListing"
                  >
                    {{ t('integrations.editorOpen') }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
