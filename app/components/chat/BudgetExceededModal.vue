<script setup lang="ts">
defineProps<{
  open: boolean
  message: string
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const { t } = useI18n()

function close() {
  emit('dismiss')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
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
          v-if="open"
          class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          @click="close"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="open"
              class="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              role="alertdialog"
              aria-modal="true"
              :aria-label="t('chat.weeklyTokenBudgetTitle')"
              @click.stop
            >
              <header class="flex flex-col gap-3 px-6 pb-2 pt-6">
                <div class="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-6" />
                </div>
                <h2 class="text-title-sm font-semibold tracking-tight text-neutral-950">
                  {{ t('chat.weeklyTokenBudgetTitle') }}
                </h2>
                <p class="text-body-md leading-relaxed text-neutral-600">
                  {{ message }}
                </p>
              </header>

              <div class="flex items-center justify-end gap-2 px-6 pb-6 pt-5">
                <button
                  type="button"
                  class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                  @click="close"
                >
                  {{ t('common.dismiss') }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
