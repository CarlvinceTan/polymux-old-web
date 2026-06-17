<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()

function close() {
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
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
        v-if="props.open"
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="close"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="props.open"
            class="flex max-h-[min(85svh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white modal-surface"
            role="dialog"
            aria-modal="true"
            :aria-label="t('vault.passwords.import.title')"
            @click.stop
          >
            <div class="relative shrink-0 px-5 py-4">
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                @click="close"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
              <h2 class="pr-8 text-sm font-semibold text-neutral-900">
                {{ t('vault.passwords.import.title') }}
              </h2>
            </div>

            <div class="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
              <ImportPasswordsPanel
                :active="props.open"
                @done="close"
              />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
