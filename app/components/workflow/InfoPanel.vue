<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{
  close: []
}>()

defineSlots<{
  default?: () => unknown
  subtitle?: () => unknown
  footer?: () => unknown
}>()

const { t } = useI18n()

const panelEl = ref<HTMLElement | null>(null)

function onDocPointerDown(e: PointerEvent) {
  if (!props.open) return
  const target = e.target as Node | null
  if (!target) return
  if (panelEl.value && panelEl.value.contains(target)) return
  emit('close')
}

// Attach the outside-click listener on the *next* tick after the panel
// opens. Without the delay the very click that triggered the open (e.g.
// clicking a node or the history button) would itself be treated as an
// outside click and immediately close the panel again.
watch(() => props.open, (open) => {
  if (open) {
    setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointerDown)
    }, 0)
  }
  else {
    document.removeEventListener('pointerdown', onDocPointerDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-100 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <aside
      v-if="open"
      ref="panelEl"
      class="absolute right-3 top-[112px] bottom-[180px] z-40 flex w-[340px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg sm:right-4"
    >
      <header class="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-neutral-900">
            {{ title }}
          </div>
          <slot name="subtitle" />
        </div>
        <button
          type="button"
          class="flex shrink-0 items-center text-neutral-400 transition-colors hover:text-neutral-900"
          :aria-label="t('workflow.close')"
          @click="emit('close')"
        >
          <UIcon name="i-heroicons-x-mark-20-solid" class="size-3" />
        </button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <slot />
      </div>

      <footer
        v-if="$slots.footer"
        class="flex shrink-0 items-center gap-1.5 border-t border-neutral-200 px-3 py-2"
      >
        <slot name="footer" />
      </footer>
    </aside>
  </Transition>
</template>
