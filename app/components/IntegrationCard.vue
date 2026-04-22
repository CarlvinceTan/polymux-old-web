<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/useMarketplace'

const props = defineProps<{
  id: string
  name: string
  description: string
  category: ItemCategory
  author: string
  installed: boolean
}>()

const emit = defineEmits<{
  toggle: [opts?: { migrate?: boolean }]
}>()

const { t } = useI18n()
const { isAdmin, connectionFor } = useMarketplace()

const categoryLabel = computed<Record<ItemCategory, string>>(() => ({
  workflow: t('integrations.categoryWorkflow'),
  plugin: t('integrations.categoryPlugin'),
  connection: t('integrations.categoryConnection'),
}))

const connection = computed(() => connectionFor(props.id))

const connectedByEmail = computed(() => connection.value?.account_email ?? null)

// Drive-specific: opt-in migration of existing Polymux files into the new
// Drive folder. Surfaced inline so admins can decide before the OAuth round-trip.
const isDrive = computed(() => props.id === 'google-drive')
const showMigrateOption = computed(
  () => isDrive.value && !props.installed && isAdmin.value,
)
const migrateExisting = ref(false)

function actionLabel() {
  if (props.installed) {
    return props.category === 'connection' ? t('integrations.disconnect') : t('integrations.uninstall')
  }
  return props.category === 'connection' ? t('integrations.connect') : t('integrations.install')
}

function onAction() {
  if (showMigrateOption.value) {
    emit('toggle', { migrate: migrateExisting.value })
    return
  }
  emit('toggle')
}
</script>

<template>
  <div class="ghost-panel flex flex-col gap-3 rounded-xl bg-white p-4">
    <div class="flex items-start gap-3">
      <div
        class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100"
        :class="{ 'bg-google-drive-tint text-google-drive': isDrive }"
      >
        <!-- Drive triangle glyph for the google-drive provider; fallback icons for everything else. -->
        <svg
          v-if="isDrive"
          class="size-4"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7.71 3 1 14.5 4.29 20H10.7l3.3-5.5L17.29 20H23.7L17 8.5 13.71 3Z" />
        </svg>
        <svg
          v-else-if="category === 'workflow'"
          class="size-4 text-neutral-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <svg
          v-else-if="category === 'plugin'"
          class="size-4 text-neutral-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        <svg
          v-else
          class="size-4 text-neutral-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-semibold leading-tight text-neutral-950">
            {{ name }}
          </p>
          <span class="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-600">
            {{ categoryLabel[category] }}
          </span>
        </div>
        <p class="mt-0.5 text-label-md text-neutral-400">
          {{ author }}
        </p>
      </div>
    </div>

    <p class="flex-1 text-body-md leading-relaxed text-neutral-500">
      {{ description }}
    </p>

    <p
      v-if="installed && category === 'connection' && connectedByEmail"
      class="text-label-md text-neutral-500"
    >
      {{ t('integrations.connectedBy', { email: connectedByEmail }) }}
    </p>

    <label
      v-if="showMigrateOption"
      class="flex cursor-pointer items-start gap-2 rounded-lg bg-neutral-50 p-3 text-left"
    >
      <input
        v-model="migrateExisting"
        type="checkbox"
        class="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-neutral-950"
      >
      <span class="min-w-0 flex-1">
        <span class="block text-label-md font-medium text-neutral-900">
          {{ t('integrations.driveMigratePrompt') }}
        </span>
        <span class="mt-0.5 block text-label-md text-neutral-500">
          {{ t('integrations.driveMigrateDescription') }}
        </span>
      </span>
    </label>

    <button
      type="button"
      class="w-full rounded-lg py-2 text-sm font-medium transition-colors"
      :class="[
        !isAdmin && 'cursor-not-allowed opacity-60',
        installed
          ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          : 'bg-neutral-950 text-white hover:bg-neutral-800',
      ]"
      :disabled="!isAdmin"
      :title="!isAdmin ? t('integrations.adminOnly') : undefined"
      @click="onAction"
    >
      {{ actionLabel() }}
    </button>
  </div>
</template>
