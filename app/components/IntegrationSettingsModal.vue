<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/useMarketplace'

interface SelectedItem {
  id: string
  name: string
  category: ItemCategory
}

const props = defineProps<{
  open: boolean
  item: SelectedItem | null
  isAdmin: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const { state: migrationState, run: runDriveMigration } = useDriveMigration()

const categoryLabel = computed<Record<ItemCategory, string>>(() => ({
  workflow: t('integrations.categoryWorkflow'),
  plugin: t('integrations.categoryPlugin'),
  connection: t('integrations.categoryConnection'),
}))

const icon = computed(() =>
  props.item ? integrationIconMeta(props.item.id, props.item.category) : null,
)

const isDrive = computed(() => props.item?.id === 'google-drive')

const migrateDisabled = computed(
  () => !props.isAdmin || migrationState.status === 'running',
)

function close() {
  emit('update:open', false)
}

function onMigrateClick() {
  if (migrateDisabled.value) return
  runDriveMigration()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) close()
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
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
          v-if="open && item"
          class="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          @click="close"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="open && item"
              class="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              style="max-height: 90svh"
              role="dialog"
              aria-modal="true"
              :aria-label="t('integrations.settingsTitle')"
              @click.stop
            >
              <button
                type="button"
                class="absolute top-4 right-4 z-10 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                :aria-label="t('common.close')"
                @click="close"
              >
                <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
              </button>

              <header class="flex items-start gap-3 px-6 pt-6 pb-4">
                <div
                  v-if="icon"
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg"
                  :class="icon.tintClass"
                >
                  <UIcon :name="icon.iconName" class="size-5" />
                </div>
                <div class="min-w-0 flex-1 pr-6">
                  <p class="truncate text-body-md font-semibold leading-tight text-neutral-950">
                    {{ item.name }}
                  </p>
                  <p class="mt-0.5 text-label-md text-neutral-500">
                    {{ categoryLabel[item.category] }} · {{ t('integrations.settingsTitle') }}
                  </p>
                </div>
              </header>

              <div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                <template v-if="isDrive">
                  <div class="space-y-4">
                    <DriveMigrationStatus :state="migrationState" />
                    <section>
                      <h2 class="mb-3 text-body-md font-semibold tracking-tight text-neutral-950">
                        {{ t('integrations.settingsSectionData') }}
                      </h2>
                      <div class="ghost-panel rounded-lg bg-white p-4">
                        <div class="flex items-start gap-4">
                          <div class="min-w-0 flex-1">
                            <p class="text-body-md font-medium text-neutral-950">
                              {{ t('integrations.settingsMigrateLabel') }}
                            </p>
                            <p class="mt-1 text-label-md text-neutral-500">
                              {{ t('integrations.settingsMigrateDescription') }}
                            </p>
                          </div>
                          <button
                            type="button"
                            class="shrink-0 rounded-lg bg-neutral-950 px-3 py-1.5 text-label-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="migrateDisabled"
                            :title="!isAdmin ? t('integrations.adminOnly') : undefined"
                            @click="onMigrateClick"
                          >
                            {{
                              migrationState.status === 'running'
                                ? t('integrations.settingsMigrateBusy')
                                : t('integrations.settingsMigrateNow')
                            }}
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                </template>

                <div v-else class="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-12 text-center">
                  <div class="mb-3 flex size-10 items-center justify-center rounded-full bg-white ghost-panel">
                    <UIcon name="i-heroicons-sparkles-20-solid" class="size-4 text-neutral-500" />
                  </div>
                  <p class="text-body-md font-medium text-neutral-950">
                    {{ t('integrations.settingsEmpty') }}
                  </p>
                  <p class="mt-1 max-w-xs text-label-md text-neutral-500">
                    {{ t('integrations.settingsEmptySubtitle') }}
                  </p>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
