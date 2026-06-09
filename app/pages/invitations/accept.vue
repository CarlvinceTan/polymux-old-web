<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

interface Preview {
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
  workspace_name: string
}

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { fetchWorkspaces, switchWorkspace } = useWorkspaces()
const { $posthog } = useNuxtApp()

const token = computed(() => (route.query.token as string | undefined) ?? '')

const status = ref<'loading' | 'preview' | 'accepting' | 'accepted' | 'error'>('loading')
const errorMessage = ref<string | null>(null)
const preview = ref<Preview | null>(null)
const acceptedWorkspaceId = ref<string | null>(null)

async function loadPreview() {
  if (!token.value) {
    status.value = 'error'
    errorMessage.value = t('invitations.errors.tokenMissing')
    return
  }
  if (!user.value) {
    const redirect = `/invitations/accept?token=${encodeURIComponent(token.value)}`
    router.replace(`/sign-in?redirect=${encodeURIComponent(redirect)}`)
    return
  }

  const { data, error } = await supabase.rpc('peek_workspace_invitation', { invite_token: token.value })
  if (error) {
    status.value = 'error'
    errorMessage.value = t('invitations.errors.loadFailed')
    return
  }
  if (!data) {
    status.value = 'error'
    errorMessage.value = t('invitations.errors.invalidOrRevoked')
    return
  }

  preview.value = data as unknown as Preview

  if (preview.value.accepted_at) {
    status.value = 'error'
    errorMessage.value = t('invitations.errors.alreadyAccepted')
    return
  }
  if (new Date(preview.value.expires_at).getTime() <= Date.now()) {
    status.value = 'error'
    errorMessage.value = t('invitations.errors.expired')
    return
  }

  status.value = 'preview'
}

async function acceptInvitation() {
  if (!token.value) return
  status.value = 'accepting'
  errorMessage.value = null

  const { data, error } = await supabase.rpc('accept_workspace_invitation', { invite_token: token.value })
  if (error) {
    status.value = 'error'
    errorMessage.value = friendlyAcceptError(error.message)
    return
  }

  const result = data as { workspace_id?: string } | null
  if (result?.workspace_id) {
    acceptedWorkspaceId.value = result.workspace_id
    await fetchWorkspaces()
    switchWorkspace(result.workspace_id)
  }
  $posthog?.capture('invitation_accepted', {
    workspace_name: preview.value?.workspace_name,
    role: preview.value?.role,
    workspace_id: result?.workspace_id,
  })
  status.value = 'accepted'
}

function friendlyAcceptError(raw: string): string {
  if (raw.includes('invitation_email_mismatch')) return t('invitations.errors.emailMismatch')
  if (raw.includes('invitation_expired')) return t('invitations.errors.expiredShort')
  if (raw.includes('invitation_already_accepted')) return t('invitations.errors.alreadyUsed')
  if (raw.includes('invitation_not_found')) return t('invitations.errors.notFound')
  return t('invitations.errors.acceptFailed')
}

function continueToDashboard() {
  router.replace('/dashboard/console')
}

onMounted(loadPreview)
watch(user, loadPreview)

useOnReconnect(() => {
  if (status.value === 'error' || status.value === 'loading') loadPreview()
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
    <div class="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div v-if="status === 'loading'" class="flex flex-col items-center gap-3 py-6 text-center">
        <svg class="size-6 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
        <p class="text-body-md text-neutral-500">{{ t('invitations.loading') }}</p>
      </div>

      <div v-else-if="status === 'preview' && preview" class="flex flex-col items-center gap-5 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
          <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
        </div>
        <div>
          <h1 class="text-headline-md font-semibold tracking-tight text-neutral-950">
            {{ t('invitations.joinTitle', { name: preview.workspace_name }) }}
          </h1>
          <p class="mt-2 text-body-md text-neutral-500">
            {{ t('invitations.invitedAs', { role: preview.role }) }}
          </p>
        </div>
        <div class="w-full rounded-lg bg-neutral-50 px-4 py-3 text-left">
          <p class="text-label-md font-medium text-neutral-500">{{ t('invitations.sentTo') }}</p>
          <p class="mt-0.5 truncate text-body-md text-neutral-900">{{ preview.email }}</p>
        </div>
        <div class="flex w-full gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-body-md font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            @click="router.replace('/dashboard/console')"
          >
            {{ t('invitations.decline') }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
            @click="acceptInvitation"
          >
            {{ t('invitations.accept') }}
          </button>
        </div>
      </div>

      <div v-else-if="status === 'accepting'" class="flex flex-col items-center gap-3 py-6 text-center">
        <svg class="size-6 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
        <p class="text-body-md text-neutral-500">{{ t('invitations.joining') }}</p>
      </div>

      <div v-else-if="status === 'accepted'" class="flex flex-col items-center gap-5 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <div>
          <h1 class="text-headline-md font-semibold tracking-tight text-neutral-950">
            {{ t('invitations.acceptedTitle') }}
          </h1>
          <p class="mt-2 text-body-md text-neutral-500">
            {{ t('invitations.acceptedBody', { name: preview?.workspace_name ?? '' }) }}
          </p>
        </div>
        <button
          type="button"
          class="w-full rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
          @click="continueToDashboard"
        >
          {{ t('invitations.continueToDashboard') }}
        </button>
      </div>

      <div v-else-if="status === 'error'" class="flex flex-col items-center gap-5 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <div>
          <h1 class="text-headline-md font-semibold tracking-tight text-neutral-950">
            {{ t('invitations.unavailableTitle') }}
          </h1>
          <p class="mt-2 text-body-md text-neutral-500">
            {{ errorMessage }}
          </p>
        </div>
        <button
          type="button"
          class="w-full rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
          @click="router.replace('/dashboard/console')"
        >
          {{ t('invitations.goToDashboard') }}
        </button>
      </div>
    </div>
  </div>
</template>
