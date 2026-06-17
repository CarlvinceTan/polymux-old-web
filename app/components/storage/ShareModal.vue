<script setup lang="ts">
import type { SelectedItem } from '~/types/storage'

const props = defineProps<{
  items: SelectedItem[]
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const { workspaces, currentWorkspace } = useWorkspaces()
const { validateSubdirectoryShare } = useStorageFiles()
const user = useSupabaseUser()

type PermissionLevel = 'viewer' | 'editor'

interface ApplyError {
  filePath: string
  targetWorkspaceId: string
  message: string
}

const selectedWorkspaceIds = ref<Set<string>>(new Set())
const permissionLevel = ref<PermissionLevel>('viewer')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const warningMessage = ref<string | null>(null)
const applyErrors = ref<ApplyError[]>([])

const isMulti = computed(() => props.items.length > 1)
const primaryItem = computed(() => props.items[0] ?? null)
const filePaths = computed(() => props.items.map(i => i.path))

const canShare = computed(() => !!currentWorkspace.value && !!user.value && props.items.length > 0)

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
  if (isMulti.value) return // per-path check on submit; multi-target conflicts surface in `applyErrors`.
  const path = primaryItem.value?.path
  if (!path) return
  try {
    const result = await validateSubdirectoryShare(path)
    if (!result.canShare) {
      warningMessage.value = result.message || t('storage.share.subdirectoryWarning')
    }
  }
  catch (err) {
    console.error('Subdirectory validation failed:', err)
  }
}

async function shareWithSelected() {
  if (selectedWorkspaceIds.value.size === 0) return
  if (!currentWorkspace.value) return
  isLoading.value = true
  errorMessage.value = null
  successMessage.value = null
  applyErrors.value = []
  try {
    const result = await $fetch<{
      ok: true
      created: { id: string; file_path: string; shared_with_workspace_id: string }[]
      errors: ApplyError[]
    }>(`/api/workspaces/${currentWorkspace.value.id}/shares/apply`, {
      method: 'POST',
      body: {
        filePaths: filePaths.value,
        targetWorkspaceIds: Array.from(selectedWorkspaceIds.value),
        permissionLevel: permissionLevel.value,
        cascade: true,
      },
    })
    applyErrors.value = result.errors
    if (result.errors.length === 0) {
      const n = selectedWorkspaceIds.value.size
      const messageKey = isMulti.value
        ? 'storage.share.sharedItemsWithWorkspaces'
        : (n === 1 ? 'storage.share.sharedWithOne' : 'storage.share.sharedWithMany')
      successMessage.value = t(messageKey, { n, items: props.items.length })
      setTimeout(() => emit('close'), 1500)
    }
    else if (result.created.length > 0) {
      successMessage.value = t('storage.share.partialSuccess', { n: result.created.length })
    }
    else {
      errorMessage.value = t('storage.share.failedToShare')
    }
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('storage.share.failedToShare')
  }
  finally {
    isLoading.value = false
  }
}

const titleSuffix = computed(() => {
  if (isMulti.value) return t('storage.share.multiTitleSuffix', { n: props.items.length })
  return `"${primaryItem.value?.name ?? ''}"`
})

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
        <div class="w-full max-w-lg mx-4 rounded-2xl bg-white modal-surface overflow-hidden">

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
              {{ t('storage.share.title') }} {{ titleSuffix }}
            </h3>
          </div>

          <!-- Body -->
          <div class="px-5 pb-5 space-y-5 pt-1">

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
              <p class="text-xs text-amber-700">{{ t('storage.share.ownerOnly') }}</p>
            </div>
            <div v-if="applyErrors.length > 0" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 space-y-1">
              <p
                v-for="(e, i) in applyErrors"
                :key="i"
                class="text-xs text-red-700"
              >{{ e.filePath || '/' }} → {{ e.message }}</p>
            </div>

            <!-- Permission level -->
            <div>
              <p class="text-xs font-medium text-neutral-500 mb-2">{{ t('storage.share.permissionLevel') }}</p>
              <div class="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 w-fit">
                <button
                  v-for="level in (['viewer', 'editor'] as PermissionLevel[])"
                  :key="level"
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="permissionLevel === level
                    ? 'bg-white text-neutral-950 ring-1 ring-neutral-200/80'
                    : 'text-neutral-500 hover:text-neutral-700'"
                  @click="permissionLevel = level"
                >
                  {{ level === 'viewer' ? t('storage.share.viewer') : t('storage.share.editor') }}
                </button>
              </div>
            </div>

            <!-- Workspace list -->
            <div>
              <p class="text-xs font-medium text-neutral-500 mb-2">{{ t('storage.share.selectWorkspaces') }}</p>
              <div v-if="availableWorkspaces.length === 0" class="py-6 text-center">
                <p class="text-sm text-neutral-400">{{ t('storage.share.noOtherWorkspaces') }}</p>
              </div>
              <div v-else class="max-h-56 divide-y divide-neutral-200/80 overflow-y-auto">
                <label
                  v-for="workspace in availableWorkspaces"
                  :key="workspace.id"
                  class="flex cursor-pointer items-center gap-3 px-1 py-3 transition-colors"
                  :class="isWorkspaceSelected(workspace.id)
                    ? 'bg-neutral-50'
                    : 'hover:bg-neutral-50/60'"
                >
                  <input
                    type="checkbox"
                    :name="`share-workspace-${workspace.id}`"
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
          <div class="px-5 py-3.5 flex items-center justify-end gap-2">
            <button
              class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
              @click="emit('close')"
            >
              {{ t('storage.share.cancel') }}
            </button>
            <button
              class="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              :class="canShare && selectedWorkspaceIds.size > 0 && !isLoading
                ? 'bg-neutral-950 text-white hover:bg-neutral-800'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'"
              :disabled="!canShare || selectedWorkspaceIds.size === 0 || isLoading"
              @click="shareWithSelected"
            >
              {{ isLoading ? t('storage.share.sharing') : t('storage.share.submit') }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
