<script setup lang="ts">
import { useI18n } from '#imports'

const props = defineProps<{
  origin: string
  lastSeenAt: string
  lastUsedAt?: string | null
  savedByName?: string
  lastUsedByName?: string | null
}>()

const emit = defineEmits<{
  forget: [origin: string]
}>()

const { t, locale } = useI18n()
const imgError = ref(false)
const isOpen = ref(false)
const dropdownPos = ref({ top: 0, left: 0 })

// Strip the scheme for the visible title so cards line up with their
// password counterparts (which show a bare hostname). The favicon lookup
// keeps the full URL since Google's favicon service needs a real domain.
const displayHost = computed(() => {
  try {
    return new URL(props.origin).host
  }
  catch {
    return props.origin
  }
})

const faviconSrc = computed(() => {
  try {
    const domain = new URL(props.origin).hostname
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`
  }
  catch {
    return `https://www.google.com/s2/favicons?sz=32&domain=${props.origin}`
  }
})

// Same inline time-ago formatter as PasswordCard. When we introduce a
// shared util (likely the moment a third card lands here), both call sites
// move to it. timeAgo() is used twice: once for last_used_at (powering
// "Used by Y · 2h ago") and once for last_seen_at (powering the
// "Updated 2h ago" fallback when nobody has preloaded yet).
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

const lastUsedAgo = computed(() => timeAgo(props.lastUsedAt))
const lastSeenAgo = computed(() => timeAgo(props.lastSeenAt))

function toggleDropdown(event: MouseEvent) {
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropdownPos.value = { top: rect.bottom, left: rect.left }
  isOpen.value = true
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  const dropdown = document.querySelector(`.si-dropdown-${props.origin.replace(/[^a-z0-9]/gi, '_')}`)
  const trigger = document.querySelector(`.si-trigger-${props.origin.replace(/[^a-z0-9]/gi, '_')}`)
  if (trigger?.contains(target)) return
  if (dropdown?.contains(target)) return
  isOpen.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

const dropdownKey = computed(() => props.origin.replace(/[^a-z0-9]/gi, '_'))
</script>

<template>
  <div class="ghost-panel group relative flex items-start gap-3 rounded-lg bg-white p-4 transition-all hover:border-neutral-400 hover:shadow-sm">
    <div class="size-9 shrink-0 rounded-lg flex items-center justify-center bg-neutral-100 border border-neutral-200 overflow-hidden">
      <img
        v-if="!imgError"
        :src="faviconSrc"
        :alt="displayHost"
        class="size-5 object-contain"
        @error="imgError = true"
      >
      <svg
        v-else
        class="size-5 text-neutral-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M11 8v3" />
        <path d="M11 14h.01" />
      </svg>
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate font-semibold text-body-md text-neutral-950">{{ displayHost }}</p>
      <p class="truncate text-meta text-neutral-500">{{ t('vault.signIns.savedSignIn') }}</p>
      <p v-if="savedByName" class="mt-1 truncate text-meta text-neutral-400">
        {{ t('vault.passwords.savedBy', { name: savedByName }) }}
      </p>
      <p v-if="lastUsedByName && lastUsedAgo" class="truncate text-meta text-neutral-400">
        {{ t('vault.passwords.lastUsedBy', { name: lastUsedByName, when: lastUsedAgo }) }}
      </p>
      <p v-else-if="lastSeenAgo" class="truncate text-meta text-neutral-400">
        {{ t('vault.signIns.updatedAgo', { when: lastSeenAgo }) }}
      </p>
    </div>

    <svg
      :class="`si-trigger-${dropdownKey}`"
      class="size-4 shrink-0 text-neutral-400 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-neutral-950 transition-colors"
      :style="isOpen ? 'opacity:1;color:#0a0a0a' : ''"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      @click="toggleDropdown"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>

    <Teleport to="body">
      <div
        v-if="isOpen"
        :class="`si-dropdown-${dropdownKey}`"
        class="fixed z-[9999] mt-1 w-28 rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden"
        :style="{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px' }"
      >
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
          @click.stop="emit('forget', origin); isOpen = false"
        >
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          {{ t('vault.signIns.forget') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
