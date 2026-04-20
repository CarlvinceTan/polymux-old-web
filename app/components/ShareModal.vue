<script setup lang="ts">
import type { SelectedItem } from '~/components/ContextualActionBar.vue'

const props = defineProps<{
  item: SelectedItem
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const { workspaces, currentWorkspace } = useWorkspaces()
const { shareDirectory, validateSubdirectoryShare } = useStorage()
const user = useSupabaseUser()

type PermissionLevel = 'viewer' | 'editor'

const selectedWorkspaceIds = ref<Set<string>>(new Set())
const permissionLevel = ref<PermissionLevel>('viewer')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const warningMessage = ref<string | null>(null)

const canShare = computed(() => !!currentWorkspace.value && !!user.value)

const availableWorkspaces = computed(() =>
  workspaces.value.filter(ws => ws.id !== currentWorkspace.value?.id),
)

function toggleWorkspace(workspaceId: string) {
  if (selectedWorkspaceIds.value.has(workspaceId)) {
    selectedWorkspaceIds.value.delete(workspaceId)
  }
  else {
    selectedWorkspaceIds.value.add(workspaceId)
  }
}

function isWorkspaceSelected(workspaceId: string): boolean {
  return selectedWorkspaceIds.value.has(workspaceId)
}

async function checkParentShare() {
  warningMessage.value = null
  try {
    const result = await validateSubdirectoryShare(props.item.path)
    if (!result.canShare) {
      warningMessage.value = result.message || 'This directory is within an already shared folder'
    }
  }
  catch (err) {
    console.error('Subdirectory validation failed:', err)
  }
}

async function shareWithSelected() {
  if (selectedWorkspaceIds.value.size === 0) return
  isLoading.value = true
  errorMessage.value = null
  successMessage.value = null
  try {
    for (const workspaceId of selectedWorkspaceIds.value) {
      const success = await shareDirectory(props.item.path, workspaceId, permissionLevel.value)
      if (!success) throw new Error('Failed to share with workspace')
    }
    successMessage.value = `Shared with ${selectedWorkspaceIds.value.size} workspace${selectedWorkspaceIds.value.size !== 1 ? 's' : ''}`
    setTimeout(() => emit('close'), 1500)
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to share'
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  selectedWorkspaceIds.value.clear()
  checkParentShare()
})
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
      @click.self="emit('close')"
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

          <!-- Title -->
          <div class="relative px-5 pt-5 pb-4">
            <button
              class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
              @click="emit('close')"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            <h3 class="text-sm font-semibold text-neutral-900 pr-8 truncate">
              {{ t('storage.share.title') }} "{{ item.name }}"
            </h3>
          </div>

          <!-- Body -->
          <div class="px-5 pb-5 border-t border-neutral-100 space-y-5 pt-4">

            <!-- Status messages -->
            <div v-if="errorMessage" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p class="text-xs text-red-700">{{ errorMessage }}</p>
            </div>
            <div v-if="successMessage" class="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
              <p class="text-xs text-green-700">{{ successMessage }}</p>
            </div>
            <div v-if="warningMessage" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p class="text-xs text-amber-700">{{ warningMessage }}</p>
            </div>
            <div v-if="!canShare" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p class="text-xs text-amber-700">{{ t('storage.share.ownerOnly') || 'Only workspace owners can share files' }}</p>
            </div>

            <!-- Permission level -->
            <div>
              <p class="text-xs font-medium text-neutral-500 mb-2">{{ t('storage.share.permissionLevel') || 'Permission level' }}</p>
              <div class="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 w-fit">
                <button
                  v-for="level in (['viewer', 'editor'] as PermissionLevel[])"
                  :key="level"
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="permissionLevel === level
                    ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200/80'
                    : 'text-neutral-500 hover:text-neutral-700'"
                  @click="permissionLevel = level"
                >
                  {{ level === 'viewer' ? t('storage.share.viewer') : t('storage.share.editor') }}
                </button>
              </div>
            </div>

            <!-- Workspace list -->
            <div>
              <p class="text-xs font-medium text-neutral-500 mb-2">{{ t('storage.share.selectWorkspaces') || 'Select workspaces' }}</p>
              <div v-if="availableWorkspaces.length === 0" class="py-6 text-center">
                <p class="text-sm text-neutral-400">{{ t('storage.share.noOtherWorkspaces') || 'No other workspaces available' }}</p>
              </div>
              <div v-else class="space-y-2 max-h-56 overflow-y-auto">
                <label
                  v-for="workspace in availableWorkspaces"
                  :key="workspace.id"
                  class="flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer"
                  :class="isWorkspaceSelected(workspace.id)
                    ? 'bg-neutral-50 border-neutral-400'
                    : 'border-neutral-200 hover:bg-neutral-50'"
                >
                  <input
                    type="checkbox"
                    :checked="isWorkspaceSelected(workspace.id)"
                    class="rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950"
                    @change="toggleWorkspace(workspace.id)"
                  >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-neutral-950">{{ workspace.name }}</p>
                    <p class="text-xs text-neutral-400">{{ workspace.slug }}</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-neutral-100 px-5 py-3.5 flex items-center justify-end gap-2">
            <button
              class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
              @click="emit('close')"
            >
              {{ t('storage.share.cancel') || 'Cancel' }}
            </button>
            <button
              class="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              :class="canShare && selectedWorkspaceIds.size > 0 && !isLoading
                ? 'bg-neutral-950 text-white hover:bg-neutral-800'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'"
              :disabled="!canShare || selectedWorkspaceIds.size === 0 || isLoading"
              @click="shareWithSelected"
            >
              {{ isLoading ? t('storage.share.sharing') || 'Sharing…' : t('storage.share.share') || 'Share' }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
