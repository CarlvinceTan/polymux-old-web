<script setup lang="ts">
import type { WorkspaceMember } from '~/composables/useWorkspaces'

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

const planKey = computed(() => (currentWorkspace.value?.plan ?? 'free').toLowerCase())
const planDisplayName = computed(() => {
  const k = planKey.value
  return k.charAt(0).toUpperCase() + k.slice(1)
})

const roleLabel = computed(() => {
  const r = myRole.value
  if (!r) return ''
  return r.charAt(0).toUpperCase() + r.slice(1)
})

const upgradeQuery = computed(() => {
  const q: Record<string, string> = { current: planKey.value }
  if (currentWorkspace.value?.id) q.workspaceId = currentWorkspace.value.id
  return q
})
const showUpgrade = computed(() => planKey.value !== 'enterprise')

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
        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto">
          <div class="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
            <!-- Workspace identity hero -->
            <section class="relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white via-white to-neutral-50">
              <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-neutral-950 via-neutral-700 to-neutral-950" />
              <div
                class="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(10,10,10,0.06),transparent_60%)]"
                aria-hidden="true"
              />
              <div
                class="pointer-events-none absolute right-0 top-0 h-full w-56 opacity-[0.035]"
                style="background-image: linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px); background-size: 22px 22px;"
                aria-hidden="true"
              />
              <div class="relative p-5 sm:p-6">
                <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
                  <!-- Avatar with hover overlay -->
                  <div
                    class="group relative size-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-neutral-200/70 sm:size-24"
                    :class="{ 'cursor-pointer': canManageMembers }"
                    @click="canManageMembers && !isAvatarSaving ? triggerAvatarPicker() : null"
                  >
                    <img
                      v-if="currentWorkspace?.avatar_url"
                      :src="currentWorkspace.avatar_url"
                      alt=""
                      class="h-full w-full object-cover"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-2xl font-bold text-white sm:text-3xl"
                      aria-hidden="true"
                    >
                      {{ workspaceInitials }}
                    </div>
                    <div
                      v-if="canManageMembers"
                      class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-[11px] font-medium text-white opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100"
                    >
                      <svg v-if="!isAvatarSaving" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.17 14.5c-.5-1.5-1.6-2.7-2.9-3.5a7.5 7.5 0 1 0-3.2 3.2c.8 1.3 2 2.4 3.5 2.9l2.6-2.6Z" />
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                        <circle cx="12" cy="13" r="3.5" />
                      </svg>
                      <svg v-else class="size-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="9" stroke-opacity="0.3" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
                      </svg>
                      <span>{{ isAvatarSaving ? 'Uploading…' : 'Change' }}</span>
                    </div>
                  </div>

                  <!-- Identity info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <h2 class="truncate text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
                        {{ currentWorkspace?.name || 'Workspace' }}
                      </h2>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <span class="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                        <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
                        {{ planDisplayName }} plan
                      </span>
                      <span
                        v-if="roleLabel"
                        class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        :class="myRole === 'owner'
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'
                          : myRole === 'admin'
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60'
                            : 'bg-neutral-100 text-neutral-600'"
                      >
                        <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        {{ roleLabel }}
                      </span>
                    </div>
                    <p v-if="canManageMembers" class="mt-3 text-[11px] text-neutral-500">
                      Click the logo to upload a new image. PNG, JPG, WebP or GIF — up to 1 MB.
                    </p>
                  </div>

                  <!-- Avatar actions -->
                  <div v-if="canManageMembers && currentWorkspace?.avatar_url" class="flex shrink-0 gap-2 sm:flex-col">
                    <button
                      type="button"
                      class="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                      :disabled="isAvatarSaving"
                      @click="removeAvatar"
                    >
                      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                      Remove
                    </button>
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
            </section>

            <!-- General: workspace name -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <div class="flex items-start gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <svg class="size-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold text-neutral-950">General</h3>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    The display name your team sees across Polymux.
                  </p>
                </div>
              </div>

              <div class="mt-5">
                <label for="ws-name" class="block text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Workspace name
                </label>
                <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                  <div class="relative min-w-0 flex-1">
                    <input
                      id="ws-name"
                      v-model="editName"
                      type="text"
                      :maxlength="WORKSPACE_NAME_MAX_LENGTH"
                      class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-16 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
                      :disabled="!canManageMembers"
                      @focus="isNameFocused = true"
                      @blur="isNameFocused = false"
                      @keyup.enter="saveName"
                    />
                    <span
                      v-if="isNameFocused"
                      class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] leading-none tabular-nums text-neutral-400"
                    >
                      {{ editName.length }}/{{ WORKSPACE_NAME_MAX_LENGTH }}
                    </span>
                  </div>
                  <button
                    v-if="canManageMembers"
                    type="button"
                    class="shrink-0 rounded-lg bg-neutral-950 px-4 py-2.5 text-body-md font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    :disabled="isSaving || !nameValidation.ok || editName.trim() === currentWorkspace?.name"
                    @click="saveName"
                  >
                    {{ isSaving ? 'Saving…' : 'Save' }}
                  </button>
                </div>
                <div class="mt-1.5 flex items-center gap-2 text-[11px] leading-4">
                  <p v-if="nameError" class="text-red-600">{{ nameError }}</p>
                  <p v-else-if="editName.trim() && editName.trim() !== currentWorkspace?.name" class="text-neutral-500">
                    Press Enter or click Save to apply changes.
                  </p>
                  <p v-else class="text-neutral-400">
                    Letters, numbers and spaces — up to {{ WORKSPACE_NAME_MAX_LENGTH }} characters.
                  </p>
                </div>
              </div>
            </section>

            <!-- Plan callout (configuration only — limits & usage live in /dashboard/usage) -->
            <NuxtLink
              to="/dashboard/usage"
              class="group flex items-center gap-4 rounded-2xl border border-neutral-200/70 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm sm:p-5"
            >
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-neutral-950 group-hover:text-white">
                <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-sm font-semibold text-neutral-950">{{ planDisplayName }} plan</h3>
                  <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                    Workspace billing
                  </span>
                </div>
                <p class="mt-1 text-xs text-neutral-500">
                  See seats, sessions, storage and spend in
                  <span class="font-medium text-neutral-700">Usage &amp; limits</span>.
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  v-if="showUpgrade"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  @click.stop.prevent="navigateTo({ path: '/pricing', query: upgradeQuery })"
                >
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
                  Upgrade
                </button>
                <svg class="size-4 text-neutral-300 transition-colors group-hover:text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </div>
            </NuxtLink>

            <!-- Ownership / Membership -->
            <section
              v-if="canTransferOwnership || canLeaveWorkspace"
              class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6"
            >
              <div class="flex items-start gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <svg class="size-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="m3 21 7-7" /></svg>
                </div>
                <div class="min-w-0">
                  <h3 class="text-sm font-semibold text-neutral-950">
                    {{ canTransferOwnership ? 'Ownership' : 'Membership' }}
                  </h3>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    <template v-if="canTransferOwnership">
                      Hand off this workspace to another member. You will keep admin access.
                    </template>
                    <template v-else>
                      Step away from this workspace. You will lose access to its sessions, files and data.
                    </template>
                  </p>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  v-if="canTransferOwnership"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                  @click="openTransferModal"
                >
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="m3 21 7-7" /></svg>
                  Transfer ownership
                </button>
                <button
                  v-if="canLeaveWorkspace"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                  @click="openLeaveModal"
                >
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  Leave workspace
                </button>
              </div>
            </section>

            <!-- Danger zone -->
            <section v-if="canDeleteWorkspace" class="overflow-hidden rounded-2xl border border-red-200/60 bg-red-50/30">
              <div class="flex items-center gap-3 p-5 sm:p-6">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-100">
                  <svg class="size-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold text-red-900">Delete workspace</h3>
                  <p class="mt-0.5 text-xs text-red-700">
                    Permanently removes all sessions, files and data. This cannot be undone.
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:bg-red-700 hover:opacity-90"
                  @click="openDeleteModal"
                >
                  Delete workspace
                </button>
              </div>
            </section>

            <p class="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3.5 text-[11px] leading-relaxed text-neutral-500">
              These settings apply only to
              <span class="font-medium text-neutral-700">{{ currentWorkspace?.name ?? 'this workspace' }}</span>.
              Each workspace is billed separately and has its own seats, storage and session quotas.
            </p>

            <div class="h-4 w-full shrink-0 sm:h-6" aria-hidden="true" />
          </div>
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
