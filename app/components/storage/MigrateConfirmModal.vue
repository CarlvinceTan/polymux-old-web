<script setup lang="ts">
import type { StorageProvider } from '~/types/storage'
import type { FileIconName } from '~/composables/ui/useFileIcons'

// One row of the modal's list — a top-level item the user is about to migrate.
// Folder descendants are intentionally NOT enumerated (the user already saw
// the folder at pick time; listing its contents would bloat the modal).
export interface MigrateConfirmItem {
  name: string
  kind: 'file' | 'folder'
  icon: FileIconName
}

// Each group = one source provider's items, all heading to `targetProvider`.
// Multi-drag can hit several source providers at once, so the modal renders
// one section per source.
export interface MigrateConfirmGroup {
  sourceProvider: StorageProvider
  items: MigrateConfirmItem[]
}

const { t } = useI18n()

const props = defineProps<{
  groups: MigrateConfirmGroup[]
  targetProvider: StorageProvider
  targetParentName: string
  isMigrating?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const providerLabels = computed<Record<StorageProvider, string>>(() => ({
  'google-drive': 'Google Drive',
  'local': 'This device',
  'b2': t('storage.settings.providerCloud'),
}))

function providerLabel(p: StorageProvider): string {
  return providerLabels.value[p]
}

const totalItems = computed(() =>
  props.groups.reduce((sum, g) => sum + g.items.length, 0),
)
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      data-modal
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      @click.self="!isMigrating && emit('close')"
    >
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
        appear
      >
        <div class="w-full max-w-lg mx-4 rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200 overflow-hidden">
          <!-- Header -->
          <div class="relative px-5 pt-5 pb-4">
            <button
              class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700 disabled:opacity-40"
              :disabled="isMigrating"
              @click="emit('close')"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            <h3 class="text-sm font-semibold text-neutral-900 pr-8">
              Migrate across providers?
            </h3>
            <p class="mt-1 text-xs text-neutral-500">
              {{ totalItems === 1 ? 'This item lives' : 'These items live' }} on a different provider than the destination folder
              <span class="font-medium text-neutral-700">"{{ targetParentName || 'Home' }}"</span>.
              Continue to copy them to
              <span class="inline-flex items-center gap-1 align-middle">
                <StorageProviderIcon :provider="targetProvider" inline />
                <span class="font-medium text-neutral-700">{{ providerLabel(targetProvider) }}</span>
              </span>
              and remove the originals.
            </p>
          </div>

          <!-- Body: one section per source provider -->
          <div class="border-t border-neutral-100 px-5 py-4 space-y-4 max-h-80 overflow-y-auto">
            <div v-for="group in groups" :key="group.sourceProvider">
              <div class="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                <StorageProviderIcon :provider="group.sourceProvider" inline />
                <span class="font-medium text-neutral-700">{{ providerLabel(group.sourceProvider) }}</span>
                <svg class="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
                </svg>
                <StorageProviderIcon :provider="targetProvider" inline />
                <span class="font-medium text-neutral-700">{{ providerLabel(targetProvider) }}</span>
              </div>
              <ul class="space-y-1">
                <li
                  v-for="(item, i) in group.items"
                  :key="`${group.sourceProvider}-${i}-${item.name}`"
                  class="flex items-center gap-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-800"
                >
                  <svg class="size-4 text-neutral-500 shrink-0" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="item.kind === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <template v-else>
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </template>
                  </svg>
                  <span class="truncate">{{ item.name }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-neutral-100 px-5 py-3.5 flex items-center justify-end gap-2">
            <button
              class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              :disabled="isMigrating"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              class="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              :class="!isMigrating ? 'bg-neutral-950 text-white hover:bg-neutral-800' : 'bg-neutral-300 text-white cursor-not-allowed'"
              :disabled="isMigrating"
              @click="emit('confirm')"
            >
              {{ isMigrating ? 'Migrating…' : 'Migrate' }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
