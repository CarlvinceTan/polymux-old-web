<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/useMarketplace'

const props = withDefaults(
  defineProps<{
    id: string
    name: string
    description: string
    category: ItemCategory
    author: string
    installed: boolean
    variant?: 'marketplace' | 'installed'
  }>(),
  { variant: 'marketplace' },
)

const emit = defineEmits<{
  toggle: []
  configure: []
}>()

const { t } = useI18n()
const { isAdmin, connectionFor } = useMarketplace()

const categoryLabel = computed<Record<ItemCategory, string>>(() => ({
  workflow: t('integrations.categoryWorkflow'),
  plugin: t('integrations.categoryPlugin'),
  connection: t('integrations.categoryConnection'),
}))

const icon = computed(() => integrationIconMeta(props.id, props.category))

const connection = computed(() => connectionFor(props.id))
const connectedByEmail = computed(() => connection.value?.account_email ?? null)

function actionLabel() {
  if (props.installed) {
    return props.category === 'connection' ? t('integrations.disconnect') : t('integrations.uninstall')
  }
  return props.category === 'connection' ? t('integrations.connect') : t('integrations.install')
}
</script>

<template>
  <div class="ghost-panel relative flex flex-col gap-3 rounded-xl bg-white p-4">
    <button
      v-if="variant === 'installed'"
      type="button"
      class="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      :aria-label="t('integrations.configure')"
      :title="t('integrations.configure')"
      @click="emit('configure')"
    >
      <UIcon name="i-heroicons-cog-6-tooth-20-solid" class="size-4" />
    </button>

    <div class="flex items-start gap-3" :class="{ 'pr-9': variant === 'installed' }">
      <div
        class="flex size-8 shrink-0 items-center justify-center rounded-lg"
        :class="icon.tintClass"
      >
        <UIcon :name="icon.iconName" class="size-4" />
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
      @click="emit('toggle')"
    >
      {{ actionLabel() }}
    </button>
  </div>
</template>
