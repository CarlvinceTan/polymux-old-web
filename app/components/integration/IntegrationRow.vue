<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory, MarketplaceItem } from '~/composables/integrations/useMarketplace'

// One dense, low-chrome row in the unified plugins table — the integrations
// analogue of CredentialRow. Category is conveyed by the tinted leading icon
// (provider brand icon when known, else the category glyph); the whole row is
// a button that opens IntegrationSettingsModal, where install/connect lives.
const props = defineProps<{
  item: MarketplaceItem
  installed: boolean
}>()

const emit = defineEmits<{
  open: [item: MarketplaceItem]
}>()

const { t } = useI18n()

const icon = computed(() => integrationIconMeta(props.item.id, props.item.category))

const categoryLabel = computed(
  () =>
    ({
      workflow: t('integrations.categoryWorkflow'),
      plugin: t('integrations.categoryPlugin'),
      integration: t('integrations.categoryConnection'),
      layout: t('integrations.categoryLayout'),
    })[props.item.category as ItemCategory],
)

// Compact install count: 1.2k / 3M.
const installsLabel = computed(() => {
  const n = props.item.popularity ?? 0
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
})
</script>

<template>
  <button
    type="button"
    :data-testid="`integration-row-${item.id}`"
    class="group grid w-full grid-cols-[minmax(0,2.2fr)_minmax(0,2.8fr)_112px_minmax(0,1.4fr)_48px] items-center gap-3 border-b border-neutral-200/70 px-3 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-950/15"
    @click="emit('open', item)"
  >
    <!-- Tinted type/provider icon + name (+ Official badge) + muted author -->
    <div class="flex min-w-0 items-center gap-2.5">
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-md"
        :class="icon.tintClass"
      >
        <UIcon :name="icon.iconName" class="size-4" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-1.5">
          <p class="truncate text-body-md font-medium text-neutral-950">{{ item.name }}</p>
          <span
            v-if="item.isFirstParty"
            class="shrink-0 rounded-md bg-neutral-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
          >
            {{ t('integrations.official') }}
          </span>
        </div>
        <p class="truncate text-meta text-neutral-500">{{ t('integrations.byAuthor', { author: item.author }) }}</p>
      </div>
    </div>

    <!-- Description -->
    <p class="truncate text-body-md text-neutral-600">{{ item.description }}</p>

    <!-- Status: Installed (emerald) / Available (neutral) -->
    <div class="flex justify-start">
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-meta font-medium"
        :class="installed ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'"
      >
        <span class="size-1.5 rounded-full" :class="installed ? 'bg-emerald-500' : 'bg-neutral-400'" aria-hidden="true" />
        {{ installed ? t('integrations.filterInstalled') : t('integrations.filterAvailable') }}
      </span>
    </div>

    <!-- Installs over category -->
    <div class="min-w-0 text-meta leading-tight">
      <p class="flex items-center gap-1 truncate text-neutral-500">
        <svg class="size-3 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {{ t('integrations.installsCount', { count: installsLabel }) }}
      </p>
      <p class="truncate text-neutral-400">{{ categoryLabel }}</p>
    </div>

    <!-- Open affordance -->
    <div class="flex items-center justify-end text-neutral-300 transition-colors group-hover:text-neutral-500">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
  </button>
</template>
