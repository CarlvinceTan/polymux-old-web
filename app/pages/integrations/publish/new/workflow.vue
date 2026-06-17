<script setup lang="ts">
import { useI18n } from '#imports'

interface MyWorkflow {
  id: string
  name: string
  description?: string | null
  latest_version: { id: string, version: number, change_summary?: string | null, created_at: string } | null
}

interface PublishResponse {
  ok: true
  integration_id: string
  slug: string
}

const { t } = useI18n()
const { headerTabs, customTabs } = useIntegrationsNavTabs()
const toast = useAppToast()
const router = useRouter()
const user = useSupabaseUser()

const name = ref('')
const description = ref('')
const tagsCsv = ref('')
const iconUrl = ref('')
const workflowId = ref('')
const workflowVersionId = ref('')
const submitting = ref(false)

const { data: workflows } = useAsyncData<MyWorkflow[]>(
  'editor-my-workflows',
  async () => await $fetch<MyWorkflow[]>('/api/marketplace/my-workflows'),
  { default: () => [] },
)

watch(workflowId, (id) => {
  const wf = (workflows.value ?? []).find(w => w.id === id)
  if (wf) {
    if (!name.value) name.value = wf.name
    if (!description.value && wf.description) description.value = wf.description
    if (wf.latest_version && !workflowVersionId.value) {
      workflowVersionId.value = wf.latest_version.id
    }
  }
})

const selectedWorkflow = computed(() =>
  (workflows.value ?? []).find(w => w.id === workflowId.value) ?? null,
)

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

const namePart = computed(() => slugify(name.value))

const slug = computed(() => {
  if (!namePart.value) return ''
  return authorHandle.value ? `${authorHandle.value}/${namePart.value}` : namePart.value
})

async function onSubmit() {
  if (!slug.value || !workflowId.value || !workflowVersionId.value || !name.value || submitting.value) return
  submitting.value = true
  try {
    const tags = tagsCsv.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const res = await $fetch<PublishResponse>('/api/marketplace/workflows', {
      method: 'POST',
      body: {
        slug: slug.value,
        workflow_id: workflowId.value,
        workflow_version_id: workflowVersionId.value,
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        tags,
        icon_url: iconUrl.value.trim() || undefined,
      },
    })
    router.push(`/integrations/publish/${res.integration_id}`)
  }
  catch (err) {
    const message = (err as { statusMessage?: string })?.statusMessage
      ?? (err as Error)?.message
      ?? t('integrations.publishFailed')
    toast.show(message, 'error')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />
    </header>

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6" style="padding: 2.5rem 1.5rem">
        <NuxtLink
          to="/integrations/publish/new"
          class="flex items-center gap-1.5 self-start text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
        >
          <UIcon name="i-heroicons-arrow-left-20-solid" class="size-3.5" />
          {{ t('integrations.editorBack') }}
        </NuxtLink>

        <div>
          <h1 class="text-title-sm font-semibold tracking-tight text-neutral-950">
            {{ t('integrations.editorNewWorkflow') }}
          </h1>
          <p class="mt-1 text-body-md text-neutral-500">
            {{ t('integrations.editorNewWorkflowDesc') }}
          </p>
        </div>

        <form class="ghost-panel flex flex-col gap-4 rounded-xl bg-white p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorPickWorkflow') }}</span>
            <select
              v-model="workflowId"
              name="workflow-id"
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
              v-model="workflowVersionId"
              name="workflow-version-id"
              required
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
              <option value="" disabled>—</option>
              <option
                v-if="selectedWorkflow.latest_version"
                :value="selectedWorkflow.latest_version.id"
              >
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
              v-model="name"
              name="workflow-name"
              type="text"
              required
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorSlug') }}</span>
            <div
              class="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-body-md"
              :class="slug ? 'text-neutral-950' : 'text-neutral-400'"
            >
              {{ slug || t('integrations.editorSlugPreviewEmpty') }}
            </div>
            <span class="text-label-md text-neutral-500">{{ t('integrations.editorSlugAutoHelp') }}</span>
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorDescription') }}</span>
            <textarea
              v-model="description"
              name="workflow-description"
              rows="3"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorTags') }}</span>
            <input
              v-model="tagsCsv"
              name="workflow-tags"
              type="text"
              :placeholder="t('integrations.editorTagsPlaceholder')"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorIcon') }}</span>
            <input
              v-model="iconUrl"
              name="workflow-icon-url"
              type="url"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <button
            type="submit"
            class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!slug || !workflowId || !workflowVersionId || !name || submitting"
          >
            {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
          </button>
        </form>
      </div>
    </TabPanel>
  </div>
</template>
