<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/integrations/useMarketplace'

interface CatalogItem {
  id: string
  dbId: string
  slug: string
  name: string
  description: string
  category: ItemCategory
  isFirstParty: boolean
}

interface PublishResponse {
  ok: true
  integration_id: string
  slug: string
  item_count: number
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
const itemIds = ref<string[]>([])
const submitting = ref(false)

const { data: catalog } = useAsyncData<CatalogItem[]>(
  'editor-plugin-catalog',
  async () => await $fetch<CatalogItem[]>('/api/marketplace/integrations'),
  { default: () => [] },
)

// Bundleable items: anything in the catalog that isn't itself a plugin.
const bundleable = computed(() =>
  (catalog.value ?? []).filter(i => i.category !== 'plugin'),
)

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

const slug = computed(() => {
  const namePart = slugify(name.value)
  if (!namePart) return ''
  return authorHandle.value ? `${authorHandle.value}/${namePart}` : namePart
})

function toggleItem(id: string) {
  const idx = itemIds.value.indexOf(id)
  if (idx === -1) itemIds.value.push(id)
  else itemIds.value.splice(idx, 1)
}

async function onSubmit() {
  if (!slug.value || !name.value || itemIds.value.length === 0 || submitting.value) return
  submitting.value = true
  try {
    const tags = tagsCsv.value.split(',').map(s => s.trim()).filter(Boolean)
    // Plugin endpoint takes child_integration_id as the actual UUID — the
    // catalog endpoint exposes `dbId` for exactly this case (since `id`
    // is the slug for client-side stability).
    const idMap = new Map<string, string>()
    for (const c of catalog.value ?? []) {
      idMap.set(c.id, c.dbId)
    }
    const items = itemIds.value
      .map(id => ({ child_integration_id: idMap.get(id) }))
      .filter((it): it is { child_integration_id: string } => typeof it.child_integration_id === 'string')
    const res = await $fetch<PublishResponse>('/api/marketplace/plugins', {
      method: 'POST',
      body: {
        slug: slug.value,
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        tags,
        icon_url: iconUrl.value.trim() || undefined,
        items,
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
            {{ t('integrations.editorNewPlugin') }}
          </h1>
          <p class="mt-1 text-body-md text-neutral-500">
            {{ t('integrations.editorNewPluginDesc') }}
          </p>
        </div>

        <form class="ghost-panel flex flex-col gap-4 rounded-xl bg-white p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorName') }}</span>
            <input
              v-model="name"
              name="plugin-name"
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
              name="plugin-description"
              rows="2"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorTags') }}</span>
            <input
              v-model="tagsCsv"
              name="plugin-tags"
              type="text"
              :placeholder="t('integrations.editorTagsPlaceholder')"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorIcon') }}</span>
            <input
              v-model="iconUrl"
              name="plugin-icon-url"
              type="url"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
            >
          </label>

          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-neutral-950">
              {{ t('integrations.editorBundleItems') }}
              <span v-if="itemIds.length" class="ml-1 text-label-md text-neutral-500">({{ itemIds.length }})</span>
            </span>
            <p v-if="!bundleable.length" class="text-label-md text-neutral-500">
              {{ t('integrations.editorBundleNoItems') }}
            </p>
            <div v-else class="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-200 p-1">
              <button
                v-for="item in bundleable"
                :key="item.id"
                type="button"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-50"
                :class="{ 'bg-neutral-100': itemIds.includes(item.id) }"
                @click="toggleItem(item.id)"
              >
                <UIcon
                  :name="itemIds.includes(item.id) ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-plus-circle'"
                  class="size-4 shrink-0"
                  :class="itemIds.includes(item.id) ? 'text-neutral-950' : 'text-neutral-400'"
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
            :disabled="!slug || !name || !itemIds.length || submitting"
          >
            {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
          </button>
        </form>
      </div>
    </TabPanel>
  </div>
</template>
