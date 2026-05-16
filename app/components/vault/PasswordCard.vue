<script setup lang="ts">
import { useI18n } from '#imports'

const props = defineProps<{
  id: string
  name: string
  url: string
  username: string
  lastUsed?: string
  // Provenance, resolved to display names by the parent (passwords.vue) so
  // this component stays purely presentational. lastUsedByName is null when
  // the credential has never been revealed yet — the card then shows only
  // "Saved by X" without the second line.
  savedByName?: string
  lastUsedByName?: string | null
}>()

const emit = defineEmits<{
  view: [id: string]
  edit: [id: string]
  delete: [id: string]
}>()

const { t, locale } = useI18n()
const imgError = ref(false)
const isOpen = ref(false)
const dropdownPos = ref({ top: 0, left: 0 })

// Lightweight relative time formatter. The codebase has no shared
// time-ago helper today; introducing a util for a single card site feels
// premature, so we keep this inline. Falls back to a locale-aware absolute
// date when the diff is past the year horizon.
const lastUsedAgo = computed(() => {
  if (!props.lastUsed) return ''
  const then = new Date(props.lastUsed).getTime()
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
})

const faviconSrc = computed(() => {
  try {
    const domain = new URL(props.url.startsWith('http') ? props.url : `https://${props.url}`).hostname
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`
  }
  catch {
    return `https://www.google.com/s2/favicons?sz=32&domain=${props.url}`
  }
})

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
  const dropdown = document.querySelector(`.pw-dropdown-${props.id}`)
  const trigger = document.querySelector(`.pw-trigger-${props.id}`)
  if (trigger?.contains(target)) return
  if (dropdown?.contains(target)) return
  isOpen.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="ghost-panel group relative flex items-start gap-3 rounded-lg bg-white p-4 transition-all hover:border-neutral-400 hover:shadow-sm">
    <div class="size-9 shrink-0 rounded-lg flex items-center justify-center bg-neutral-100 border border-neutral-200 overflow-hidden">
      <img
        v-if="!imgError"
        :src="faviconSrc"
        :alt="name"
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
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-9.6 9.6" />
        <path d="m15.5 7.5 3 3L22 7l-3-3" />
      </svg>
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate font-semibold text-body-md text-neutral-950">{{ name }}</p>
      <p class="truncate text-meta text-neutral-500">{{ url }}</p>
      <p class="truncate text-meta text-neutral-400">{{ username }}</p>
      <p v-if="savedByName" class="mt-1 truncate text-meta text-neutral-400">
        {{ t('vault.passwords.savedBy', { name: savedByName }) }}
      </p>
      <p v-if="lastUsedByName && lastUsedAgo" class="truncate text-meta text-neutral-400">
        {{ t('vault.passwords.lastUsedBy', { name: lastUsedByName, when: lastUsedAgo }) }}
      </p>
    </div>

    <svg
      :class="`pw-trigger-${id}`"
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
        :class="`pw-dropdown-${id}`"
        class="fixed z-[9999] mt-1 w-28 rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden"
        :style="{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px' }"
      >
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-100 cursor-pointer transition-colors"
          @click.stop="emit('view', id); isOpen = false"
        >
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
          </svg>
          {{ t('vault.passwords.view') }}
        </button>
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-100 cursor-pointer transition-colors"
          @click.stop="emit('edit', id); isOpen = false"
        >
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {{ t('vault.passwords.edit') }}
        </button>
        <div class="my-0.5 h-px bg-neutral-200 mx-2" />
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
          @click.stop="emit('delete', id); isOpen = false"
        >
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          {{ t('common.delete') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>