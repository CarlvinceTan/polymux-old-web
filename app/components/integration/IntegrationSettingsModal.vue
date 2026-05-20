<script setup lang="ts">
import { useI18n } from '#imports'
import type { MarketplaceItem, ItemCategory } from '~/composables/integrations/useMarketplace'
import type { StorageProvider } from '~/types/storage'

const props = defineProps<{
  open: boolean
  item: MarketplaceItem | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const { isAdmin, isInstalled, install, uninstall, connectionFor } = useMarketplace()

// Marketplace ids that map 1:1 to a StorageProvider. Disconnecting these
// might strand workspace files, so we route them through the disconnect
// warning modal instead of calling uninstall() directly.
const STORAGE_INTEGRATION_TO_PROVIDER: Record<string, StorageProvider> = {
  'google-drive': 'google-drive',
}

const disconnectModalOpen = ref(false)
const pendingDisconnectProvider = ref<StorageProvider | null>(null)

const categoryLabel = computed<Record<ItemCategory, string>>(() => ({
  workflow: t('integrations.categoryWorkflow'),
  plugin: t('integrations.categoryPlugin'),
  integration: t('integrations.categoryConnection'),
  layout: t('integrations.categoryLayout'),
}))

const icon = computed(() =>
  props.item ? integrationIconMeta(props.item.id, props.item.category) : null,
)

const installed = computed(() => (props.item ? isInstalled(props.item.id) : false))
const requiresOauth = computed(() => props.item?.requiresOauth === true)

const connection = computed(() =>
  props.item ? connectionFor(props.item.id) : null,
)
const connectedEmail = computed(() => connection.value?.account_email ?? null)

const primaryActionLabel = computed(() => {
  if (!props.item) return ''
  if (installed.value) {
    return requiresOauth.value ? t('integrations.disconnect') : t('integrations.uninstall')
  }
  return requiresOauth.value ? t('integrations.connect') : t('integrations.install')
})

function close() {
  emit('update:open', false)
}

function onPrimaryAction() {
  if (!props.item || !isAdmin.value) return
  if (installed.value) {
    const storageProvider = STORAGE_INTEGRATION_TO_PROVIDER[props.item.id]
    if (storageProvider) {
      // Storage-backed integration. Hand off to the disconnect modal so the
      // user can migrate any files that still live on this backend before the
      // connection drops.
      pendingDisconnectProvider.value = storageProvider
      disconnectModalOpen.value = true
      return
    }
    uninstall(props.item.id)
    close()
  }
  else {
    install(props.item.id)
  }
}

async function onConfirmDisconnect() {
  if (!props.item) return
  await uninstall(props.item.id)
  pendingDisconnectProvider.value = null
  close()
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
              v-if="open && item"
              class="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              style="max-height: 90svh"
              role="dialog"
              aria-modal="true"
              :aria-label="item.name"
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

              <header class="flex flex-col gap-4 px-6 pb-5 pt-6">
                <div class="flex items-start gap-4 pr-8">
                  <div
                    v-if="icon"
                    class="flex size-14 shrink-0 items-center justify-center rounded-xl"
                    :class="icon.tintClass"
                  >
                    <UIcon :name="icon.iconName" class="size-7" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h2 class="truncate text-title-sm font-semibold tracking-tight text-neutral-950">
                      {{ item.name }}
                    </h2>
                    <p class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-md text-neutral-500">
                      <span>{{ t('integrations.byAuthor', { author: item.author }) }}</span>
                      <span class="text-neutral-300">·</span>
                      <span>{{ categoryLabel[item.category] }}</span>
                      <!-- "Official" first-party chip, right of the type label. -->
                      <span
                        v-if="item.isFirstParty"
                        class="rounded-md bg-neutral-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                      >
                        {{ t('integrations.official') }}
                      </span>
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    :class="[
                      !isAdmin && 'cursor-not-allowed opacity-60',
                      installed
                        ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        : 'bg-neutral-950 text-white hover:bg-neutral-800',
                    ]"
                    :disabled="!isAdmin"
                    :title="!isAdmin ? t('integrations.adminOnly') : undefined"
                    @click="onPrimaryAction"
                  >
                    {{ primaryActionLabel }}
                  </button>
                  <a
                    v-if="item.githubUrl"
                    :href="item.githubUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-label-md font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
                    :aria-label="t('integrations.viewOnGithub')"
                  >
                    <UIcon name="i-simple-icons-github" class="size-4" />
                    <span>{{ t('integrations.github') }}</span>
                    <UIcon name="i-heroicons-arrow-top-right-on-square-20-solid" class="size-3.5 text-neutral-400" />
                  </a>
                </div>

                <div v-if="item.tags?.length" class="flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in item.tags"
                    :key="tag"
                    class="rounded-md bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-600"
                  >
                    {{ tag }}
                  </span>
                </div>
              </header>

              <div class="h-px bg-neutral-100" />

              <div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
                <section>
                  <h3 class="mb-2 text-body-md font-semibold tracking-tight text-neutral-950">
                    {{ t('integrations.aboutHeading') }}
                  </h3>
                  <p class="text-body-md leading-relaxed text-neutral-600">
                    {{ item.description }}
                  </p>
                </section>

                <section v-if="installed && requiresOauth && connectedEmail" class="mt-6">
                  <h3 class="mb-2 text-body-md font-semibold tracking-tight text-neutral-950">
                    {{ t('integrations.statusHeading') }}
                  </h3>
                  <div class="ghost-panel flex items-center gap-3 rounded-lg bg-white p-3">
                    <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                      <UIcon name="i-heroicons-check-circle-20-solid" class="size-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-body-md font-medium text-neutral-950">
                        {{ t('integrations.active') }}
                      </p>
                      <p class="truncate text-label-md text-neutral-500">
                        {{ t('integrations.connectedBy', { email: connectedEmail }) }}
                      </p>
                    </div>
                  </div>
                </section>

                <section v-if="installed" class="mt-6">
                  <h3 class="mb-2 text-body-md font-semibold tracking-tight text-neutral-950">
                    {{ t('integrations.settingsHeading') }}
                  </h3>
                  <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
                    <div class="ghost-panel mb-3 flex size-10 items-center justify-center rounded-full bg-white">
                      <UIcon name="i-heroicons-sparkles-20-solid" class="size-4 text-neutral-500" />
                    </div>
                    <p class="text-body-md font-medium text-neutral-950">
                      {{ t('integrations.settingsEmpty') }}
                    </p>
                    <p class="mt-1 max-w-xs text-label-md text-neutral-500">
                      {{ t('integrations.settingsEmptySubtitle') }}
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <DisconnectStorageProviderModal
      v-model:open="disconnectModalOpen"
      :provider="pendingDisconnectProvider"
      @disconnect="onConfirmDisconnect"
    />
  </ClientOnly>
</template>
