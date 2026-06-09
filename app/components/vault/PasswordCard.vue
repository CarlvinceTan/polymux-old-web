<script setup lang="ts">
import { useI18n } from '#imports'

const props = defineProps<{
  id: string
  name: string
  url: string
  username: string
  hasTotp?: boolean
}>()

const emit = defineEmits<{
  view: [id: string]
  delete: [id: string]
}>()

const { t } = useI18n()
const imgError = ref(false)
const isOpen = ref(false)
const dropdownPos = ref({ top: 0, left: 0 })

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
  event.stopPropagation()
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropdownPos.value = { top: rect.bottom, left: rect.left }
  isOpen.value = true
}

function handleCardClick() {
  emit('view', props.id)
}

function handleCardKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleCardClick()
  }
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
  <div
    class="ghost-panel group relative flex cursor-pointer items-start gap-3 rounded-lg bg-white p-4 transition-all hover:border-neutral-400 hover:shadow-sm"
    role="button"
    tabindex="0"
    @click="handleCardClick"
    @keydown="handleCardKeydown"
  >
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
      <span
        v-if="hasTotp"
        class="mt-1.5 inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
        :title="t('vault.passwords.totpBadgeTitle')"
      >
        <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        {{ t('vault.passwords.totpBadge') }}
      </span>
    </div>

    <svg
      :class="`pw-trigger-${id}`"
      class="size-4 shrink-0 text-neutral-400 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-neutral-950 transition-colors"
      :style="isOpen ? 'opacity:1;color:#0a0a0a' : ''"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      @click.stop="toggleDropdown"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>

    <Teleport to="body">
      <div
        v-if="isOpen"
        :class="`pw-dropdown-${id}`"
        class="fixed z-[9999] mt-1 w-28 rounded-md bg-white shadow-lg ring-1 ring-neutral-200 overflow-hidden"
        :style="{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px' }"
      >
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-100 cursor-pointer transition-colors"
          @click.stop="emit('view', id); isOpen = false"
        >
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
          {{ t('vault.passwords.details') }}
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