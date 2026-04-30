<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  accept: []
}>()

const { t } = useI18n()

const acknowledged = ref(false)

function handleAccept() {
  if (!acknowledged.value) return
  emit('accept')
  isOpen.value = false
}

watch(isOpen, (open) => {
  if (!open) acknowledged.value = false
})
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
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-[2px]"
          role="presentation"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="isOpen"
              class="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
              role="dialog"
              aria-modal="true"
              :aria-label="t('betaAgreement.title')"
              @click.stop
            >
              <div class="px-6 pt-6 pb-5">
                <div class="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                  <span class="size-1.5 rounded-full bg-amber-500" />
                  {{ t('betaAgreement.badge') }}
                </div>

                <h2 class="text-base font-semibold text-neutral-950">
                  {{ t('betaAgreement.title') }}
                </h2>
                <p class="mt-1.5 text-sm text-neutral-600">
                  {{ t('betaAgreement.lead') }}
                </p>

                <ul class="mt-5 space-y-3 text-sm text-neutral-700">
                  <li class="flex gap-3">
                    <span class="mt-1 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                    <span>{{ t('betaAgreement.bullet1') }}</span>
                  </li>
                  <li class="flex gap-3">
                    <span class="mt-1 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                    <span>{{ t('betaAgreement.bullet2') }}</span>
                  </li>
                  <li class="flex gap-3">
                    <span class="mt-1 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                    <span>{{ t('betaAgreement.bullet3') }}</span>
                  </li>
                  <li class="flex gap-3">
                    <span class="mt-1 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                    <span>{{ t('betaAgreement.bullet4') }}</span>
                  </li>
                </ul>

                <p class="mt-5 text-xs text-neutral-500">
                  {{ t('betaAgreement.footnote') }}
                  <NuxtLink
                    to="/privacy-policy"
                    class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
                  >
                    {{ t('betaAgreement.privacyPolicy') }}
                  </NuxtLink>
                  {{ t('betaAgreement.and') }}
                  <NuxtLink
                    to="/terms-of-service"
                    class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
                  >
                    {{ t('betaAgreement.termsOfService') }}
                  </NuxtLink>{{ t('betaAgreement.footnoteEnd') }}
                </p>

                <label class="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100">
                  <input
                    v-model="acknowledged"
                    type="checkbox"
                    class="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-neutral-300 text-neutral-950 focus:ring-2 focus:ring-neutral-950/20"
                  />
                  <span class="text-sm text-neutral-800">
                    {{ t('betaAgreement.acknowledgement') }}
                  </span>
                </label>
              </div>

              <div class="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-6 py-3.5">
                <button
                  type="button"
                  class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!acknowledged"
                  @click="handleAccept"
                >
                  {{ t('betaAgreement.acceptButton') }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
