<script setup lang="ts">
import type { UpgradePlanPayload } from '~/types/upgradePlan'
import { upgradePlanReasonKey } from '~/composables/account/useUpgradePlanModal'

const props = defineProps<{
  open: boolean
  payload: UpgradePlanPayload | null
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const { t } = useI18n()

const reasonTitle = computed(() => {
  if (!props.payload) return t('upgradePlan.title')
  return t(`${upgradePlanReasonKey(props.payload.reason)}.title`)
})

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
          v-if="open && payload"
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
              v-if="open && payload"
              class="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              role="dialog"
              aria-modal="true"
              :aria-label="reasonTitle"
              @click.stop
            >
              <div class="px-6 pt-6">
                <UpgradePlanContent :payload="payload" />
              </div>

              <div class="flex items-center justify-end gap-2 px-6 pb-6 pt-5">
                <button
                  type="button"
                  class="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  @click="close"
                >
                  {{ t('upgradePlan.notNow') }}
                </button>
                <PlanUpgradeButton :before-navigate="close" />
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
