<script setup lang="ts">
import type { WorkspaceMember } from '~/composables/useWorkspaces'

const BROWSER_AGENT_CAPS: Record<string, number> = { free: 2, pro: 8, max: 20, enterprise: 50 }

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()
const user = useSupabaseUser()

const {
  workspaces,
  currentWorkspace,
  members,
  fetchMembers,
  updateWorkspace,
  transferOwnership,
  deleteWorkspace,
  leaveWorkspace,
} = useWorkspaces()

const editName = ref('')
const isSaving = ref(false)
const isNameFocused = ref(false)

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageMembers = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const canDeleteWorkspace = computed(() => myRole.value === 'owner')
const canTransferOwnership = computed(() => myRole.value === 'owner')
const canLeaveWorkspace = computed(() => myRole.value === 'admin' || myRole.value === 'member')
const isOnlyWorkspace = computed(() => workspaces.value.length <= 1)

const transferableMembers = computed(() =>
  members.value.filter(m => m.user_id !== user.value?.id),
)
const transferDisplayMembers = computed(() => {
  const owner = members.value.find(m => m.role === 'owner')
  const others = members.value.filter(m => m.role !== 'owner')
  return owner ? [owner, ...others] : others
})

watch(currentWorkspace, (ws) => {
  if (ws) {
    editName.value = ws.name
    fetchMembers(ws.id)
  }
}, { immediate: true })

const nameValidation = computed(() => validateWorkspaceName(editName.value))
const nameError = computed(() => {
  if (!editName.value || editName.value === currentWorkspace.value?.name) return ''
  return nameValidation.value.ok ? '' : nameValidation.value.error
})

async function saveName() {
  if (!currentWorkspace.value) return
  const validation = validateWorkspaceName(editName.value)
  if (!validation.ok) return
  isSaving.value = true
  try { await updateWorkspace(currentWorkspace.value.id, { name: editName.value.trim() }) }
  finally { isSaving.value = false }
}

// Transfer ownership modal
const isTransferOpen = ref(false)
const transferStep = ref<'select' | 'confirm'>('select')
const selectedTransferId = ref<string | null>(null)
const isTransferring = ref(false)
const transferError = ref('')

const selectedTransferMember = computed(() =>
  transferableMembers.value.find(m => m.user_id === selectedTransferId.value) ?? null,
)

function openTransferModal() {
  transferStep.value = 'select'
  selectedTransferId.value = null
  transferError.value = ''
  isTransferOpen.value = true
}

function closeTransferModal() {
  if (isTransferring.value) return
  isTransferOpen.value = false
}

function goToTransferConfirm() {
  if (!selectedTransferId.value) return
  transferStep.value = 'confirm'
}

async function handleTransferOwnership() {
  if (!currentWorkspace.value || !selectedTransferId.value || !user.value) return
  isTransferring.value = true
  transferError.value = ''
  try {
    const result = await transferOwnership(
      currentWorkspace.value.id,
      selectedTransferId.value,
      user.value.sub,
    )
    if (!result.ok) {
      transferError.value = 'Failed to transfer ownership. Please try again.'
      return
    }
    isTransferOpen.value = false
  }
  finally {
    isTransferring.value = false
  }
}

// Leave workspace modal
const isLeaveOpen = ref(false)
const isLeaving = ref(false)
const leaveError = ref('')

function openLeaveModal() {
  leaveError.value = ''
  isLeaveOpen.value = true
}

function closeLeaveModal() {
  if (isLeaving.value) return
  isLeaveOpen.value = false
}

async function handleLeaveWorkspace() {
  if (!currentWorkspace.value || !user.value) return
  isLeaving.value = true
  leaveError.value = ''
  try {
    const result = await leaveWorkspace(currentWorkspace.value.id, user.value.sub)
    if (!result.ok) {
      leaveError.value = 'Failed to leave workspace. Please try again.'
      return
    }
    isLeaveOpen.value = false
    navigateTo('/dashboard/home')
  }
  finally {
    isLeaving.value = false
  }
}

// Delete workspace modal
const isDeleteOpen = ref(false)
const isDeleting = ref(false)
const deleteError = ref('')

function openDeleteModal() {
  deleteError.value = ''
  isDeleteOpen.value = true
}

function closeDeleteModal() {
  if (isDeleting.value) return
  isDeleteOpen.value = false
}

async function handleDeleteWorkspace() {
  if (!currentWorkspace.value) return
  isDeleting.value = true
  deleteError.value = ''
  try {
    const result = await deleteWorkspace(currentWorkspace.value.id)
    if (!result.ok) {
      deleteError.value = 'Failed to delete workspace. Please try again.'
      return
    }
    isDeleteOpen.value = false
    navigateTo('/dashboard/home')
  }
  finally {
    isDeleting.value = false
  }
}

function memberDisplayName(m: WorkspaceMember) {
  return m.display_name || m.email || m.user_id.substring(0, 8) + '…'
}

function memberEmail(m: WorkspaceMember) {
  return m.email || '—'
}

function memberInitials(m: WorkspaceMember) {
  const name = m.display_name || m.email || m.user_id
  return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
}

const browserAgentCapValue = computed(() =>
  BROWSER_AGENT_CAPS[currentWorkspace.value?.plan ?? 'free'] ?? BROWSER_AGENT_CAPS.free,
)

// Avatar upload
const AVATAR_MAX_INPUT_BYTES = 1 * 1024 * 1024
const AVATAR_OUTPUT_SIZE = 256
const AVATAR_OUTPUT_QUALITY = 0.85
const avatarInput = ref<HTMLInputElement | null>(null)
const isAvatarSaving = ref(false)
const workspaceInitials = computed(() =>
  (currentWorkspace.value?.name?.trim().substring(0, 2) || 'W').toUpperCase(),
)

type AvatarRequirementKey = 'type' | 'size' | 'aspect' | 'decode'
const AVATAR_REQUIREMENTS: { key: AvatarRequirementKey, label: string }[] = [
  { key: 'type', label: 'Must be an image file (PNG, JPG, WebP, GIF).' },
  { key: 'size', label: 'File size must be 5 MB or smaller.' },
  { key: 'aspect', label: '1:1 aspect ratio (square). Non-square images are center-cropped.' },
  { key: 'decode', label: 'Must be a readable image (not corrupted).' },
]

const isAvatarWarningOpen = ref(false)
const avatarWarningTitle = ref('')
const avatarWarningDetail = ref('')
const avatarWarningKeys = ref<AvatarRequirementKey[]>([])

function showAvatarWarning(title: string, detail: string, keys: AvatarRequirementKey[]) {
  avatarWarningTitle.value = title
  avatarWarningDetail.value = detail
  avatarWarningKeys.value = keys
  isAvatarWarningOpen.value = true
}

function triggerAvatarPicker() {
  avatarInput.value?.click()
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to read image.')) }
    img.src = url
  })
}

function cropImageToDataURL(img: HTMLImageElement): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = Math.floor((img.naturalWidth - side) / 2)
  const sy = Math.floor((img.naturalHeight - side) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported in this browser.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
  let dataUrl = canvas.toDataURL('image/webp', AVATAR_OUTPUT_QUALITY)
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', AVATAR_OUTPUT_QUALITY)
  }
  return dataUrl
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

async function handleAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !currentWorkspace.value || !canManageMembers.value) return

  if (!file.type.startsWith('image/')) {
    showAvatarWarning(
      'Unsupported file type',
      `The file "${file.name}" is not an image${file.type ? ` (type: ${file.type})` : ''}. Please choose a PNG, JPG, WebP, or GIF.`,
      ['type'],
    )
    return
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    showAvatarWarning(
      'Image is too large',
      `The file is ${formatBytes(file.size)}, which exceeds the 1 MB limit. Please choose a smaller image or compress this one first.`,
      ['size'],
    )
    return
  }

  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  }
  catch {
    showAvatarWarning(
      'Could not read image',
      'The file could not be decoded as an image. It may be corrupted or in an unsupported format.',
      ['decode'],
    )
    return
  }

  isAvatarSaving.value = true
  try {
    const dataUrl = cropImageToDataURL(img)
    const result = await updateWorkspace(currentWorkspace.value.id, { avatar_url: dataUrl })
    if (!result) {
      showAvatarWarning(
        'Upload failed',
        'The server rejected the update. Make sure you have owner or admin permission, and that the backend service is reachable.',
        [],
      )
    }
  }
  catch (err) {
    console.error('[settings] avatar upload failed', err)
    showAvatarWarning(
      'Upload failed',
      err instanceof Error ? err.message : 'Something went wrong while saving the picture. Please try again.',
      [],
    )
  }
  finally {
    isAvatarSaving.value = false
  }
}

async function removeAvatar() {
  if (!currentWorkspace.value || !canManageMembers.value) return
  isAvatarSaving.value = true
  try {
    await updateWorkspace(currentWorkspace.value.id, { avatar_url: null })
  }
  finally {
    isAvatarSaving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader
      :tabs="headerTabs"
      :separator-before-path="dashboardNavSeparatorBeforePath"
      raw-tab-labels
    />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:px-8 lg:pb-6 lg:pt-5">
          <div class="mb-6 flex flex-col gap-1 border-b border-neutral-100 pb-5">
            <h1 class="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
              Settings
            </h1>
            <p class="text-body-md text-neutral-500">
              Workspace name, plan, and lifecycle
            </p>
          </div>

          <section class="min-w-0">
            <h2 class="mb-3 text-label-md font-semibold uppercase tracking-widest text-neutral-400">General</h2>
            <div class="divide-y divide-neutral-100">
              <div class="pb-5">
                <p class="block text-label-md font-medium text-neutral-500">Workspace Picture</p>
                <div class="mt-2 flex items-center gap-4">
                  <div class="size-16 shrink-0 overflow-hidden rounded-md">
                    <img
                      v-if="currentWorkspace?.avatar_url"
                      :src="currentWorkspace.avatar_url"
                      alt=""
                      class="h-full w-full object-cover"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center bg-neutral-950 text-[32px] font-bold text-white"
                      aria-hidden="true"
                    >
                      {{ workspaceInitials }}
                    </div>
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col gap-2">
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-if="canManageMembers"
                        type="button"
                        class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                        :disabled="isAvatarSaving"
                        @click="triggerAvatarPicker"
                      >
                        {{ isAvatarSaving ? 'Uploading…' : (currentWorkspace?.avatar_url ? 'Change picture' : 'Upload picture') }}
                      </button>
                      <button
                        v-if="canManageMembers && currentWorkspace?.avatar_url"
                        type="button"
                        class="rounded-lg bg-white px-4 py-2 text-body-md font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                        :disabled="isAvatarSaving"
                        @click="removeAvatar"
                      >
                        Remove
                      </button>
                    </div>
                    <p class="text-label-sm text-neutral-400">You can only upload square images up to 1 MB.</p>
                  </div>
                </div>
                <input
                  ref="avatarInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handleAvatarSelected"
                />
              </div>
              <div class="py-5">
                <label for="ws-name" class="block text-label-md font-medium text-neutral-500">Workspace Name</label>
                <div class="mt-2 flex gap-2">
                  <div class="relative min-w-0 flex-1">
                    <input
                      id="ws-name"
                      v-model="editName"
                      type="text"
                      :maxlength="WORKSPACE_NAME_MAX_LENGTH"
                      class="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 pr-14 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-950/10"
                      :disabled="!canManageMembers"
                      @focus="isNameFocused = true"
                      @blur="isNameFocused = false"
                      @keyup.enter="saveName"
                    />
                    <span
                      v-if="isNameFocused"
                      class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] leading-none tabular-nums text-neutral-400"
                    >
                      {{ editName.length }}/{{ WORKSPACE_NAME_MAX_LENGTH }}
                    </span>
                  </div>
                  <button
                    v-if="canManageMembers"
                    type="button"
                    class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    :disabled="isSaving || !nameValidation.ok || editName.trim() === currentWorkspace?.name"
                    @click="saveName"
                  >
                    Save
                  </button>
                </div>
                <p class="mt-1.5 min-h-5 text-label-sm text-red-600">{{ nameError }}</p>
              </div>
              <dl class="grid grid-cols-1 gap-6 py-5 sm:grid-cols-2 sm:gap-8">
                <div>
                  <dt class="text-label-md font-medium text-neutral-400">Plan</dt>
                  <dd class="mt-1 text-body-md capitalize text-neutral-800">{{ currentWorkspace?.plan || 'free' }}</dd>
                </div>
                <div>
                  <dt class="text-label-md font-medium text-neutral-400">Browser Agents</dt>
                  <dd class="mt-1 text-body-md tabular-nums text-neutral-800">{{ browserAgentCapValue }} max</dd>
                </div>
              </dl>
            </div>
          </section>

          <section v-if="canTransferOwnership" class="mt-10 min-w-0 border-t border-neutral-100 pt-8">
            <h2 class="mb-2 text-label-md font-semibold uppercase tracking-widest text-neutral-400">Ownership</h2>
            <p class="max-w-xl text-body-md leading-relaxed text-neutral-500">
              Transfer this workspace to another member. You will become an admin once the transfer is complete.
            </p>
            <div class="mt-5">
              <button
                type="button"
                class="rounded-lg bg-white px-4 py-2 text-body-md font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
                @click="openTransferModal"
              >
                Transfer ownership
              </button>
            </div>
          </section>

          <section v-if="canLeaveWorkspace" class="mt-10 min-w-0 border-t border-neutral-100 pt-8">
            <h2 class="mb-2 text-label-md font-semibold uppercase tracking-widest text-neutral-400">Membership</h2>
            <p class="max-w-xl text-body-md leading-relaxed text-neutral-500">
              Leave this workspace. You will lose access to its sessions, files, and data, and will need to be re-invited to rejoin.
            </p>
            <div class="mt-5">
              <button
                type="button"
                class="rounded-lg bg-white px-4 py-2 text-body-md font-medium text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50"
                @click="openLeaveModal"
              >
                Leave workspace
              </button>
            </div>
          </section>

          <section v-if="canDeleteWorkspace" class="mt-10 min-w-0 border-t border-neutral-100 pt-8">
            <h2 class="mb-2 text-label-md font-semibold uppercase tracking-widest text-red-600/90">Danger Zone</h2>
            <p class="max-w-xl text-body-md leading-relaxed text-neutral-500">Deleting this workspace will permanently remove all sessions and data within it.</p>
            <div class="mt-5">
              <button
                type="button"
                class="rounded-lg bg-white px-4 py-2 text-body-md font-medium text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50"
                @click="openDeleteModal"
              >
                Delete workspace
              </button>
            </div>
          </section>

          <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
        </div>
      </TabPanel>
    </div>
  </div>

  <UModal
    v-model:open="isTransferOpen"
    :title="transferStep === 'select' ? 'Transfer ownership' : 'Confirm transfer'"
    :description="transferStep === 'select'
      ? 'Choose the member who will become the new owner.'
      : 'Review before transferring. This takes effect immediately.'"
    :dismissible="!isTransferring"
  >
    <template #body>
      <div v-if="transferStep === 'select'" class="space-y-3">
        <div v-if="transferableMembers.length === 0" class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
          <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <p class="text-body-md leading-relaxed text-amber-900">
            There are no other members in this workspace. Invite another member before transferring ownership.
          </p>
        </div>
        <div v-else class="max-h-80 divide-y divide-neutral-100 overflow-y-auto rounded-lg ring-1 ring-neutral-200">
          <label
            v-for="m in transferDisplayMembers"
            :key="m.user_id"
            class="flex items-center gap-3 px-3 py-2.5 transition-colors"
            :class="[
              m.role === 'owner' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-neutral-50',
              selectedTransferId === m.user_id ? 'bg-neutral-50' : '',
            ]"
          >
            <input
              v-model="selectedTransferId"
              type="radio"
              name="transfer-target"
              :value="m.user_id"
              :disabled="m.role === 'owner'"
              class="size-4 accent-neutral-950"
            />
            <AccountIcon :initials="memberInitials(m)" size="md" color="bg-neutral-800" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-body-md font-medium text-neutral-950">{{ memberDisplayName(m) }}</p>
              <p class="truncate text-label-md text-neutral-400">{{ memberEmail(m) }}</p>
            </div>
            <span class="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-label-md font-medium capitalize text-neutral-600">
              {{ m.role === 'owner' ? 'Current owner' : m.role }}
            </span>
          </label>
        </div>
      </div>

      <div v-else-if="selectedTransferMember" class="space-y-4">
        <div class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
          <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <p class="text-body-md leading-relaxed text-amber-900">
            You will no longer be the owner after this transfer. Your role will become <span class="font-medium">Admin</span>, and the new owner will have full control over the workspace.
          </p>
        </div>
        <div class="flex items-center gap-3 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200">
          <AccountIcon :initials="memberInitials(selectedTransferMember)" size="lg" color="bg-neutral-800" />
          <div class="min-w-0">
            <p class="truncate text-body-md font-medium text-neutral-950">{{ memberDisplayName(selectedTransferMember) }}</p>
            <p class="truncate text-label-md text-neutral-400">{{ memberEmail(selectedTransferMember) }}</p>
          </div>
        </div>
        <p v-if="transferError" class="text-label-md text-red-600">{{ transferError }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-between gap-2">
        <button
          v-if="transferStep === 'confirm'"
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 ring-1 ring-neutral-200 disabled:opacity-50"
          :disabled="isTransferring"
          @click="transferStep = 'select'"
        >
          Back
        </button>
        <span v-else />
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 ring-1 ring-neutral-200 disabled:opacity-50"
            :disabled="isTransferring"
            @click="closeTransferModal"
          >
            Cancel
          </button>
          <button
            v-if="transferStep === 'select' && transferableMembers.length > 0"
            type="button"
            class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            :disabled="!selectedTransferId"
            @click="goToTransferConfirm"
          >
            Continue
          </button>
          <button
            v-else
            type="button"
            class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            :disabled="isTransferring"
            @click="handleTransferOwnership"
          >
            {{ isTransferring ? 'Transferring…' : 'Transfer ownership' }}
          </button>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="isLeaveOpen"
    title="Leave workspace"
    description="You will lose access immediately."
    :dismissible="!isLeaving"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
          <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <p class="text-body-md leading-relaxed text-amber-900">
            You are about to leave <span class="font-semibold">{{ currentWorkspace?.name }}</span>. You will lose access to all of its sessions, files, and data, and will need an owner or admin to re-invite you.
          </p>
        </div>
        <p v-if="leaveError" class="text-label-md text-red-600">{{ leaveError }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 ring-1 ring-neutral-200 disabled:opacity-50"
          :disabled="isLeaving"
          @click="closeLeaveModal"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          :disabled="isLeaving"
          @click="handleLeaveWorkspace"
        >
          {{ isLeaving ? 'Leaving…' : 'Yes, leave workspace' }}
        </button>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="isDeleteOpen"
    :title="isOnlyWorkspace ? 'Cannot delete workspace' : 'Delete workspace'"
    :description="isOnlyWorkspace ? 'This is your only workspace.' : 'This action cannot be undone.'"
    :dismissible="!isDeleting"
  >
    <template #body>
      <div v-if="isOnlyWorkspace" class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
        <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        <p class="text-body-md leading-relaxed text-amber-900">
          You must always have at least one workspace. Create another workspace before deleting this one.
        </p>
      </div>
      <div v-else class="space-y-4">
        <div class="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 ring-1 ring-red-200/60">
          <svg class="mt-0.5 size-4 shrink-0 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <p class="text-body-md leading-relaxed text-red-900">
            You are about to permanently delete <span class="font-semibold">{{ currentWorkspace?.name }}</span>. All sessions, files, and data in this workspace will be irreversibly removed.
          </p>
        </div>
        <p v-if="deleteError" class="text-label-md text-red-600">{{ deleteError }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 ring-1 ring-neutral-200 disabled:opacity-50"
          :disabled="isDeleting"
          @click="closeDeleteModal"
        >
          {{ isOnlyWorkspace ? 'Close' : 'Cancel' }}
        </button>
        <button
          v-if="!isOnlyWorkspace"
          type="button"
          class="rounded-lg bg-red-600 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          :disabled="isDeleting"
          @click="handleDeleteWorkspace"
        >
          {{ isDeleting ? 'Deleting…' : 'Yes, delete workspace' }}
        </button>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="isAvatarWarningOpen"
    :title="avatarWarningTitle"
    description="Please adjust the image and try again."
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
          <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <p class="text-body-md leading-relaxed text-amber-900">{{ avatarWarningDetail }}</p>
        </div>
        <div>
          <p class="mb-2 text-label-md font-semibold uppercase tracking-widest text-neutral-400">Requirements</p>
          <ul class="space-y-1.5">
            <li
              v-for="req in AVATAR_REQUIREMENTS"
              :key="req.key"
              class="flex items-start gap-2 text-body-md"
              :class="avatarWarningKeys.includes(req.key) ? 'text-red-700 font-medium' : 'text-neutral-600'"
            >
              <svg
                v-if="avatarWarningKeys.includes(req.key)"
                class="mt-0.5 size-4 shrink-0 text-red-600"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              ><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              <svg
                v-else
                class="mt-0.5 size-4 shrink-0 text-neutral-400"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              ><polyline points="20 6 9 17 4 12" /></svg>
              <span>{{ req.label }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
          @click="isAvatarWarningOpen = false"
        >
          Close
        </button>
        <button
          type="button"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
          @click="isAvatarWarningOpen = false; triggerAvatarPicker()"
        >
          Choose another image
        </button>
      </div>
    </template>
  </UModal>
</template>
