<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/wallet/useMarketplace'

interface ListingDetail {
  id: string
  slug: string
  name: string
  description: string | null
  kind: ItemCategory
  visibility: 'private' | 'unlisted' | 'public'
  is_first_party: boolean
  is_verified: boolean
  install_count: number
  tags: string[]
  icon_url: string | null
  homepage_url: string | null
  source_repo_url: string | null
  current_version_id: string | null
  created_at: string
  updated_at: string
  current_version?: { id: string, version: string, status: string, published_at: string | null } | null
}

const { t } = useI18n()
const { headerTabs } = useIntegrationsNavTabs()
const toast = useAppToast()
const route = useRoute()

const id = computed(() => String(route.params.id))

const { data: listings, refresh } = useAsyncData<ListingDetail[]>(
  () => `editor-detail-${id.value}`,
  async () => await $fetch<ListingDetail[]>('/api/marketplace/my-listings'),
  { default: () => [], watch: [id] },
)

const item = computed(() => (listings.value ?? []).find(l => l.id === id.value) ?? null)

const editName = ref('')
const editDescription = ref('')
const editVisibility = ref<'private' | 'unlisted'>('private')
const editTagsCsv = ref('')
const dirty = ref(false)
const saving = ref(false)

watch(item, (it) => {
  if (!it) return
  editName.value = it.name
  editDescription.value = it.description ?? ''
  editVisibility.value = it.visibility === 'public' ? 'unlisted' : it.visibility
  editTagsCsv.value = it.tags.join(', ')
  dirty.value = false
}, { immediate: true })

watch([editName, editDescription, editVisibility, editTagsCsv], () => {
  if (!item.value) return
  dirty.value = (
    editName.value.trim() !== item.value.name
    || editDescription.value !== (item.value.description ?? '')
    || editVisibility.value !== item.value.visibility
    || editTagsCsv.value !== item.value.tags.join(', ')
  )
})

async function onSave() {
  if (!item.value || saving.value) return
  saving.value = true
  try {
    const tags = editTagsCsv.value.split(',').map(s => s.trim()).filter(Boolean)
    await $fetch(`/api/marketplace/integrations/${item.value.id}`, {
      method: 'PATCH',
      body: {
        name: editName.value.trim(),
        description: editDescription.value || null,
        visibility: editVisibility.value,
        tags,
      },
    })
    await refresh()
    dirty.value = false
    toast.show(t('integrations.editorSaved'), 'info')
  }
  catch (err) {
    const message = (err as { statusMessage?: string })?.statusMessage
      ?? (err as Error)?.message
      ?? 'Save failed'
    toast.show(message, 'error')
  }
  finally {
    saving.value = false
  }
}

async function onYank() {
  if (!item.value) return
  if (!confirm(t('integrations.editorYankConfirm'))) return
  try {
    await $fetch(`/api/marketplace/integrations/${item.value.id}/yank`, {
      method: 'POST',
      body: {},
    })
    await refresh()
    toast.show(t('integrations.editorYanked'), 'info')
  }
  catch (err) {
    const message = (err as { statusMessage?: string })?.statusMessage
      ?? (err as Error)?.message
      ?? 'Yank failed'
    toast.show(message, 'error')
  }
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6" style="padding: 2.5rem 1.5rem">
        <NuxtLink
          to="/integrations/publish"
          class="flex items-center gap-1.5 self-start text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
        >
          <UIcon name="i-heroicons-arrow-left-20-solid" class="size-3.5" />
          {{ t('integrations.editorBack') }}
        </NuxtLink>

        <div v-if="!item" class="flex flex-1 items-center justify-center">
          <p class="text-body-md text-neutral-500">
            {{ t('common.loading') }}
          </p>
        </div>

        <template v-else>
          <header class="flex items-start gap-4">
            <div class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
              <UIcon
                :name="item.kind === 'workflow'
                  ? 'i-heroicons-bolt-20-solid'
                  : item.kind === 'plugin'
                    ? 'i-heroicons-cube-transparent-20-solid'
                    : 'i-heroicons-link-20-solid'"
                class="size-6"
              />
            </div>
            <div class="min-w-0 flex-1">
              <h1 class="truncate text-title-sm font-semibold tracking-tight text-neutral-950">
                {{ item.name }}
              </h1>
              <p class="mt-0.5 truncate font-mono text-label-md text-neutral-500">
                {{ item.slug }}
              </p>
              <p
                v-if="item.current_version"
                class="mt-1 inline-flex items-center gap-2 text-label-md text-neutral-500"
              >
                <span class="rounded-md bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">
                  {{ t('integrations.editorVersion', { version: item.current_version.version }) }}
                </span>
                <span class="font-medium">
                  {{
                    item.current_version.status === 'published'
                      ? t('integrations.editorPublished')
                      : item.current_version.status === 'yanked'
                        ? t('integrations.editorYanked')
                        : t('integrations.editorStatusDraft')
                  }}
                </span>
              </p>
            </div>
          </header>

          <form class="ghost-panel flex flex-col gap-4 rounded-xl bg-white p-5" @submit.prevent="onSave">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorName') }}</span>
              <input
                v-model="editName"
                type="text"
                required
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
              >
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorDescription') }}</span>
              <textarea
                v-model="editDescription"
                rows="3"
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
              />
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorVisibility') }}</span>
              <select
                v-model="editVisibility"
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
              >
                <option value="private">
                  {{ t('integrations.editorVisibilityPrivate') }}
                </option>
                <option value="unlisted">
                  {{ t('integrations.editorVisibilityUnlisted') }}
                </option>
              </select>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorTags') }}</span>
              <input
                v-model="editTagsCsv"
                type="text"
                :placeholder="t('integrations.editorTagsPlaceholder')"
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-950"
              >
            </label>

            <div class="flex items-center justify-between">
              <button
                type="button"
                class="text-label-md font-medium text-error-600 transition-colors hover:text-error-700"
                @click="onYank"
              >
                {{ t('integrations.editorYank') }}
              </button>
              <button
                type="submit"
                class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!dirty || saving"
              >
                {{ saving ? t('common.loading') : t('integrations.editorSave') }}
              </button>
            </div>
          </form>
        </template>
      </div>
    </TabPanel>
  </div>
</template>
