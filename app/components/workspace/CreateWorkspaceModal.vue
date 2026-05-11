<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { createWorkspace, inviteMember } = useWorkspaces()

const name = ref('')
const isSubmitting = ref(false)
const error = ref('')

const nameValidation = computed(() => validateWorkspaceName(name.value))
const nameError = computed(() => {
  if (!name.value) return ''
  return nameValidation.value.ok ? '' : nameValidation.value.error
})

interface Invite {
  email: string
  role: 'admin' | 'member'
}

const invites = ref<Invite[]>([{ email: '', role: 'member' }])

function addInviteRow() {
  invites.value.push({ email: '', role: 'member' })
}

function removeInviteRow(index: number) {
  invites.value.splice(index, 1)
}

function generateSlug(workspaceName: string): string {
  const base = workspaceName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`
}

async function handleSubmit() {
  const trimmed = name.value.trim()
  const validation = validateWorkspaceName(trimmed)
  if (!validation.ok) {
    error.value = validation.error
    return
  }
  isSubmitting.value = true
  error.value = ''
  try {
    const ws = await createWorkspace(trimmed, generateSlug(trimmed))
    if (!ws) {
      error.value = t('workspaceCreate.errorFallback')
      return
    }
    const validInvites = invites.value.filter(i => i.email.trim())
    await Promise.all(validInvites.map(i => inviteMember(ws.id, i.email.trim(), i.role)))
    handleClose()
  }
  finally {
    isSubmitting.value = false
  }
}

function handleClose() {
  name.value = ''
  error.value = ''
  invites.value = [{ email: '', role: 'member' }]
  isOpen.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') handleClose()
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="handleClose"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isOpen"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            :aria-label="t('workspaceCreate.title')"
            @click.stop
          >
            <!-- Body -->
            <div class="relative px-5 pt-5 pb-4 space-y-5">
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                :aria-label="t('common.close')"
                @click="handleClose"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>

              <!-- Title -->
              <div class="pr-6">
                <h2 class="text-sm font-semibold text-neutral-900">{{ t('workspaceCreate.title') }}</h2>
                <p class="mt-0.5 text-xs text-neutral-400">{{ t('workspaceCreate.subtitle') }}</p>
              </div>

              <!-- Per-workspace billing note -->
              <div class="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <svg class="mt-0.5 size-3.5 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <i18n-t keypath="workspaceCreate.billingNote" tag="p" class="text-xs leading-relaxed text-neutral-600">
                  <template #plan>
                    <span class="font-medium text-neutral-800">{{ t('workspaceCreate.freePlanName') }}</span>
                  </template>
                </i18n-t>
              </div>

              <!-- Workspace name -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('workspaceCreate.nameLabel') }}</label>
                <input
                  v-model="name"
                  :placeholder="t('workspaceCreate.namePlaceholder')"
                  autofocus
                  :maxlength="WORKSPACE_NAME_MAX_LENGTH"
                  class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                  @keydown.enter.prevent="handleSubmit"
                />
                <div class="mt-1.5 flex items-start justify-between gap-3 text-xs">
                  <p class="text-red-600">{{ error || nameError }}</p>
                  <p class="shrink-0 tabular-nums text-neutral-400">{{ name.length }}/{{ WORKSPACE_NAME_MAX_LENGTH }}</p>
                </div>
              </div>

              <!-- Divider -->
              <div class="h-px bg-neutral-100" />

              <!-- Invite section -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <p class="text-xs font-medium text-neutral-500">{{ t('workspaceCreate.invitesLabel') }}</p>
                    <p class="text-xs text-neutral-400 mt-0.5">{{ t('workspaceCreate.invitesHint') }}</p>
                  </div>
                </div>

                <div class="space-y-2">
                  <div
                    v-for="(invite, index) in invites"
                    :key="index"
                    class="flex items-center gap-2"
                  >
                    <!-- Email input -->
                    <input
                      v-model="invite.email"
                      type="email"
                      :placeholder="t('workspaceCreate.emailPlaceholder')"
                      class="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white py-1.5 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    />

                    <!-- Role pill toggle -->
                    <div class="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 shrink-0">
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                        :class="invite.role === 'member' ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200/80' : 'text-neutral-500 hover:text-neutral-700'"
                        @click="invite.role = 'member'"
                      >
                        {{ t('workspace.roleMember') }}
                      </button>
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                        :class="invite.role === 'admin' ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200/80' : 'text-neutral-500 hover:text-neutral-700'"
                        @click="invite.role = 'admin'"
                      >
                        {{ t('workspace.roleAdmin') }}
                      </button>
                    </div>

                    <!-- Remove row -->
                    <button
                      v-if="invites.length > 1"
                      type="button"
                      class="shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                      @click="removeInviteRow(index)"
                    >
                      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <!-- Spacer when only one row so layout stays aligned -->
                    <div v-else class="size-5.5 shrink-0" />
                  </div>
                </div>

                <button
                  type="button"
                  class="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-900"
                  @click="addInviteRow"
                >
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  {{ t('workspaceCreate.addAnother') }}
                </button>
              </div>
            </div>

            <!-- Footer -->
            <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
                @click="handleClose"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                :disabled="!nameValidation.ok || isSubmitting"
                @click="handleSubmit"
              >
                {{ isSubmitting ? t('workspaceCreate.creating') : t('workspaceCreate.submit') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
