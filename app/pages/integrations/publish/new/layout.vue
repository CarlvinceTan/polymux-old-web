<script setup lang="ts">
import { useI18n } from '#imports'
import { KNOWN_TARGET_SECTIONS, type LayoutTargetSection } from '~~/server/utils/integrations/layoutSections'

interface PublishResponse {
  ok: true
  integration_id: string
  slug: string
  target_section: LayoutTargetSection
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
const targetSection = ref<LayoutTargetSection>('integrations')
const body = ref<string>('<h1>Hello, layout!</h1>\n<p>Edit this HTML to build your tab.</p>')
const submitting = ref(false)

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const authorHandle = computed(() => {
  const email = user.value?.email ?? ''
  const local = email.split('@')[0] ?? ''
  return slugify(local)
})

const slug = computed(() => {
  const namePart = slugify(name.value)
  if (!namePart) return ''
  return authorHandle.value ? `${authorHandle.value}/${namePart}` : namePart
})

const SECTION_OPTIONS: Array<{ value: LayoutTargetSection, label: string }> = KNOWN_TARGET_SECTIONS.map(s => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

async function onSubmit() {
  if (!slug.value || !name.value || !body.value || submitting.value) return
  submitting.value = true
  try {
    const tags = tagsCsv.value.split(',').map(s => s.trim()).filter(Boolean)
    const res = await $fetch<PublishResponse>('/api/marketplace/layouts', {
      method: 'POST',
      body: {
        slug: slug.value,
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        tags,
        icon_url: iconUrl.value.trim() || undefined,
        target_section: targetSection.value,
        body: body.value,
      },
    })
    router.push(`/integrations/publish/${res.integration_id}`)
  }
  catch (err) {
    const message = (err as { statusMessage?: string })?.statusMessage
      ?? (err as Error)?.message
      ?? 'Publish failed'
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
            {{ t('integrations.editorNewLayout') }}
          </h1>
          <p class="mt-1 text-body-md text-neutral-500">
            {{ t('integrations.editorNewLayoutDesc') }}
          </p>
        </div>

        <form class="ghost-panel flex flex-col gap-4 rounded-xl bg-white p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorName') }}</span>
            <input
              v-model="name"
              name="layout-name"
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
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorLayoutSection') }}</span>
            <select
              v-model="targetSection"
              name="layout-section"
              required
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
              <option v-for="opt in SECTION_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <span class="text-label-md text-neutral-500">{{ t('integrations.editorLayoutSectionHelp') }}</span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorLayoutBody') }}</span>
            <textarea
              v-model="body"
              name="layout-body"
              rows="14"
              spellcheck="false"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-label-md text-neutral-950 outline-none focus:border-neutral-950"
            />
            <span class="text-label-md text-neutral-500">{{ t('integrations.editorLayoutBodyHelp') }}</span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorDescription') }}</span>
            <textarea
              v-model="description"
              name="layout-description"
              rows="2"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorTags') }}</span>
            <input
              v-model="tagsCsv"
              name="layout-tags"
              type="text"
              :placeholder="t('integrations.editorTagsPlaceholder')"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorIcon') }}</span>
            <input
              v-model="iconUrl"
              name="layout-icon-url"
              type="url"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <button
            type="submit"
            class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!slug || !name || !body || submitting"
          >
            {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
          </button>
        </form>
      </div>
    </TabPanel>
  </div>
</template>
