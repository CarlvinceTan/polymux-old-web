<script setup lang="ts">
import { useI18n } from '#imports'
import type { CredentialEntry } from '~/composables/vault/useCredentials'
import type { AgentAccessPolicy } from '~/composables/vault/usePasswords'

// One dense, low-chrome row in the Vault-B credentials table. Type is conveyed
// by ICON only (favicon for logins, key glyph for secrets, globe for sign-ins)
// — never a coloured badge. There is deliberately NO reveal / copy / masked-dots
// affordance anywhere; a calm lock "Secured" marker sits where a reveal would.
const props = defineProps<{
  credential: CredentialEntry
  canManageAccess: boolean
  // Resolved display name for last_used_by / created_by.
  lastUsedByName: string | null
}>()

const emit = defineEmits<{
  forget: [credential: CredentialEntry]
  'update:agent-access': [credential: CredentialEntry, policy: AgentAccessPolicy]
}>()

const { t, locale } = useI18n()
const imgError = ref(false)
const menuOpen = ref(false)
const menuWrapperRef = ref<HTMLElement | null>(null)

const isSignIn = computed(() => props.credential.kind === 'saved_signin')
const isSecret = computed(() => props.credential.kind === 'secret')
const isLogin = computed(() => props.credential.kind === 'login')

// Muted second line under the name: host for logins, "key · prefix" for
// secrets (scope shown in the username column), host for sign-ins.
const secondLine = computed(() => {
  if (isSecret.value) return t('vault.credentials.secretLabel')
  const u = props.credential.url
  if (!u) return ''
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '')
  }
  catch {
    return u
  }
})

const usernameLine = computed(() => {
  if (isSecret.value) return props.credential.username || '—'
  return props.credential.username || '—'
})

const faviconSrc = computed(() => {
  const u = props.credential.url ?? ''
  try {
    const domain = new URL(u.startsWith('http') ? u : `https://${u}`).hostname
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`
  }
  catch {
    return `https://www.google.com/s2/favicons?sz=32&domain=${u}`
  }
})

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return ''
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  if (diffSec < 60) return rtf.format(-diffSec, 'second')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return rtf.format(-diffHr, 'hour')
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return rtf.format(-diffDay, 'day')
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return rtf.format(-diffMo, 'month')
  return new Date(then).toLocaleDateString(locale.value)
}

const lastUsedAgo = computed(() => timeAgo(props.credential.lastUsedAt))

function onAgentAccess(policy: AgentAccessPolicy) {
  emit('update:agent-access', props.credential, policy)
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function handleClickOutside(event: MouseEvent) {
  if (!menuOpen.value) return
  const target = event.target as Node
  if (menuWrapperRef.value?.contains(target)) return
  const panel = document.querySelector('.credential-row-menu')
  if (panel?.contains(target)) return
  menuOpen.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div
    class="group grid grid-cols-[minmax(0,2.2fr)_minmax(0,2.8fr)_112px_minmax(0,1.4fr)_48px] items-center gap-3 border-b border-neutral-200/70 px-3 py-2 transition-colors hover:bg-neutral-50"
  >
    <!-- Type icon + name (+ muted 2nd line) -->
    <div class="flex min-w-0 items-center gap-2.5">
      <div class="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-100">
        <!-- login → favicon -->
        <img
          v-if="isLogin && !imgError"
          :src="faviconSrc"
          :alt="credential.name"
          class="size-4 object-contain"
          @error="imgError = true"
        >
        <!-- secret → key glyph -->
        <svg v-else-if="isSecret" class="size-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
        <!-- saved sign-in → globe -->
        <svg v-else-if="isSignIn" class="size-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
        </svg>
        <!-- login favicon fallback -->
        <svg v-else class="size-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
      </div>
      <div class="min-w-0">
        <p class="truncate text-body-md font-medium text-neutral-950">{{ credential.name }}</p>
        <p v-if="secondLine" class="truncate text-meta text-neutral-500" :class="isSecret ? 'font-mono' : ''">{{ secondLine }}</p>
      </div>
    </div>

    <!-- Username / scope -->
    <p class="truncate text-body-md text-neutral-600" :class="isSecret ? 'font-mono' : ''">{{ usernameLine }}</p>

    <!-- Agent access chip -->
    <div class="flex justify-start">
      <AgentAccessChip
        :model-value="credential.agentAccess"
        :editable="canManageAccess && credential.agentAccessEditable"
        :interactive="credential.agentAccessEditable"
        @update:model-value="onAgentAccess"
      />
    </div>

    <!-- Last used: "Used by {user}" over the relative time -->
    <div class="min-w-0 text-meta leading-tight">
      <template v-if="lastUsedAgo">
        <p v-if="lastUsedByName" class="truncate text-neutral-500">{{ t('vault.credentials.usedBy', { name: lastUsedByName }) }}</p>
        <p class="truncate text-neutral-400">{{ lastUsedAgo }}</p>
      </template>
      <p v-else class="truncate text-neutral-500">{{ t('vault.credentials.neverUsed') }}</p>
    </div>

    <!-- Actions: overflow menu (Delete / Forget) -->
    <div class="flex items-center justify-end">
      <div ref="menuWrapperRef" class="relative inline-flex">
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:text-neutral-950"
          :class="menuOpen ? 'text-neutral-950' : ''"
          :aria-label="t('vault.credentials.more')"
          @click.stop="toggleMenu"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        <Menu :open="menuOpen" align="right" placement="below" width="w-36" compact>
          <div class="credential-row-menu py-1" @click.stop>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-nav text-error-600 transition-colors hover:bg-error-50"
              @click="menuOpen = false; emit('forget', credential)"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              {{ isSignIn ? t('vault.signIns.forget') : t('common.delete') }}
            </button>
          </div>
        </Menu>
      </div>
    </div>
  </div>
</template>
