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
const hasParentShare = ref(false)

// Check if current user can share (must be workspace owner)
// Currently we assume the user can share - backend will validate
const canShare = computed(() => {
  return !!currentWorkspace.value && !!user.value
})

// Get list of other workspaces (exclude current workspace)
const availableWorkspaces = computed(() => {
  return workspaces.value.filter(ws => ws.id !== currentWorkspace.value?.id)
})

function toggleWorkspace(workspaceId: string) {
  if (selectedWorkspaceIds.value.has(workspaceId)) {
    selectedWorkspaceIds.value.delete(workspaceId)
  } else {
    selectedWorkspaceIds.value.add(workspaceId)
  }
}

function isWorkspaceSelected(workspaceId: string): boolean {
  return selectedWorkspaceIds.value.has(workspaceId)
}

async function checkParentShare() {
  warningMessage.value = null
  hasParentShare.value = false
  
  try {
    const result = await validateSubdirectoryShare(props.item.path)
    if (!result.canShare) {
      hasParentShare.value = true
      warningMessage.value = result.message || 'This directory is within an already shared folder'
    }
  } catch (err) {
    // Validation errors are not critical - allow sharing anyway
    console.error('Subdirectory validation failed:', err)
  }
}

async function shareWithSelected() {
  if (selectedWorkspaceIds.value.size === 0) return
  

  isLoading.value = true
  errorMessage.value = null
  successMessage.value = null
  
  try {
    // Share with each selected workspace
    for (const workspaceId of selectedWorkspaceIds.value) {
      const success = await shareDirectory(props.item.path, workspaceId, permissionLevel.value)
      if (!success) {
        throw new Error(`Failed to share with workspace`)
      }
    }
    
    successMessage.value = `Shared with ${selectedWorkspaceIds.value.size} workspace${selectedWorkspaceIds.value.size !== 1 ? 's' : ''}`
    setTimeout(() => {
      emit('close')
    }, 1500)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to share'
  } finally {
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
        <div class="w-full max-w-lg mx-4 rounded-2xl bg-white border border-neutral-200 shadow-2xl overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 pt-5 pb-4">
            <h3 class="text-headline-md font-semibold text-neutral-950 truncate pr-4">
              {{ t('storage.share.title') }} "{{ item.name }}"
            </h3>
            <button
              class="shrink-0 flex items-center justify-center size-8 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              @click="emit('close')"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <!-- Error message -->
          <div v-if="errorMessage" class="px-5 pt-3 pb-2">
            <div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <p class="text-body-sm text-red-700">{{ errorMessage }}</p>
            </div>
          </div>

          <!-- Success message -->
          <div v-if="successMessage" class="px-5 pt-3 pb-2">
            <div class="px-3 py-2 rounded-lg bg-green-50 border border-green-200">
              <p class="text-body-sm text-green-700">{{ successMessage }}</p>
            </div>
          </div>

          <!-- Warning: Parent share exists -->
          <div v-if="warningMessage" class="px-5 pt-3 pb-2">
            <div class="px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200">
              <p class="text-body-sm text-yellow-700">{{ warningMessage }}</p>
            </div>
          </div>

          <!-- Warning: Only owners can share -->
          <div v-if="!canShare" class="px-5 pt-3 pb-2">
            <div class="px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200">
              <p class="text-body-sm text-yellow-700">{{ t('storage.share.ownerOnly') || 'Only workspace owners can share files' }}</p>
            </div>
          </div>

          <!-- Content -->
          <div class="px-5 py-4 border-t border-neutral-100">
            <!-- Permission level selector -->
            <div class="mb-4">
              <p class="text-body-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                {{ t('storage.share.permissionLevel') || 'Permission Level' }}
              </p>
              <div class="flex gap-2">
                <button
                  v-for="level in (['viewer', 'editor'] as PermissionLevel[])"
                  :key="level"
                  class="flex-1 px-3 py-2 rounded-lg text-body-sm font-medium transition-colors"
                  :class="permissionLevel === level ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'"
                  @click="permissionLevel = level"
                >
                  {{ level === 'viewer' ? t('storage.share.viewer') : t('storage.share.editor') }}
                </button>
              </div>
            </div>

            <!-- Workspaces list -->
            <div>
              <p class="text-body-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                {{ t('storage.share.selectWorkspaces') || 'Select Workspaces' }}
              </p>
              <div v-if="availableWorkspaces.length === 0" class="py-6 text-center">
                <p class="text-body-sm text-neutral-500">{{ t('storage.share.noOtherWorkspaces') || 'No other workspaces available' }}</p>
              </div>
              <div v-else class="space-y-2 max-h-64 overflow-y-auto">
                <label
                  v-for="workspace in availableWorkspaces"
                  :key="workspace.id"
                  class="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
                  :class="isWorkspaceSelected(workspace.id) ? 'bg-blue-50 border-blue-300' : ''"
                >
                  <input
                    type="checkbox"
                    :checked="isWorkspaceSelected(workspace.id)"
                    class="rounded-md border-neutral-300 text-neutral-950 focus:ring-neutral-950"
                    @change="toggleWorkspace(workspace.id)"
                  >
                  <div class="flex-1 min-w-0">
                    <p class="text-body-md font-medium text-neutral-950">{{ workspace.name }}</p>
                    <p class="text-body-sm text-neutral-500">{{ workspace.slug }}</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-neutral-100 px-5 py-4 flex items-center justify-end gap-3">
            <button
              class="px-4 py-2 rounded-lg text-body-md font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
              @click="emit('close')"
            >
              {{ t('storage.share.cancel') || 'Cancel' }}
            </button>
            <button
              class="px-4 py-2 rounded-lg text-body-md font-medium transition-colors"
              :class="canShare && selectedWorkspaceIds.size > 0 && !isLoading ? 'bg-neutral-950 text-white hover:bg-neutral-800' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'"
              :disabled="!canShare || selectedWorkspaceIds.size === 0 || isLoading"
              @click="shareWithSelected"
            >
              {{ isLoading ? t('storage.share.sharing') || 'Sharing...' : t('storage.share.share') || 'Share' }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

