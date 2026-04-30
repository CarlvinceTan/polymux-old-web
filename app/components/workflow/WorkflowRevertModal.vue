<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  version: number
  submitting?: boolean
}>()

const emit = defineEmits<{
  confirm: []
}>()

const { t } = useI18n()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.submitting) isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <ClientOnly>
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
          @click.self="!submitting && (isOpen = false)"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="isOpen"
              class="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
              role="dialog"
              aria-modal="true"
              :aria-label="t('workflow.revertTitle', { version })"
              @click.stop
            >
              <div class="px-5 pt-5 pb-4">
                <h2 class="text-sm font-semibold text-neutral-900">
                  {{ t('workflow.revertTitle', { version }) }}
                </h2>
                <p class="mt-1.5 text-xs leading-relaxed text-neutral-600">
                  {{ t('workflow.revertBody', { version }) }}
                </p>
              </div>
              <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
                <button
                  type="button"
                  class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  :disabled="submitting"
                  @click="isOpen = false"
                >
                  {{ t('common.cancel') }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  :disabled="submitting"
                  @click="emit('confirm')"
                >
                  {{ submitting ? t('workflow.reverting') : t('workflow.revertConfirm') }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
