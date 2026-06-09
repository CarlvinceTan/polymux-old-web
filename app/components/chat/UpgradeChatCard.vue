<script setup lang="ts">
import type { ChatUpgradePrompt } from '~/composables/types'
import { upgradePlanReasonKey } from '~/composables/account/useUpgradePlanModal'

/**
 * In-chat replacement for the UpgradePlanModal overlay. Rendered inline in the
 * orchestrator message stream when a plan limit is hit during the chat. The
 * weekly-token-budget reason shows a lightweight amber notice (just dismiss);
 * every other reason shows the full benefits body with an upgrade CTA. Once
 * dismissed it collapses to a muted one-line summary, mirroring how the
 * credential card settles after the user responds.
 */
const props = defineProps<{
  prompt: ChatUpgradePrompt
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const { t } = useI18n()

const isPending = computed(() => props.prompt.status === 'pending')
const isBudget = computed(() => props.prompt.payload.reason === 'weekly_token_budget')

const reasonKey = computed(() => upgradePlanReasonKey(props.prompt.payload.reason))
const reasonTitle = computed(() => t(`${reasonKey.value}.title`))
const budgetBody = computed(() => {
  const msg = props.prompt.payload.message?.trim()
  return msg || t(`${reasonKey.value}.body`)
})

function dismiss() {
  emit('dismiss')
}
</script>

<template>
  <!-- Dismissed: collapse to a muted one-liner so the conversation keeps the
       context of what was prompted without holding focus. -->
  <div
    v-if="!isPending"
    class="my-2 w-full max-w-lg rounded-xl border border-neutral-200 bg-white px-4 py-3 opacity-80 ring-1 ring-neutral-950/5"
  >
    <p class="text-sm text-neutral-500">{{ reasonTitle }}</p>
  </div>

  <!-- Budget reached: lightweight amber notice, dismiss only. -->
  <div
    v-else-if="isBudget"
    class="my-2 w-full max-w-lg rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm ring-1 ring-amber-950/5"
  >
    <div class="flex items-start gap-3">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
        <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-5" />
      </div>
      <div class="flex-1">
        <p class="mb-0.5 text-sm font-semibold text-neutral-900">{{ reasonTitle }}</p>
        <p class="text-xs leading-relaxed text-neutral-600">{{ budgetBody }}</p>
      </div>
    </div>
    <div class="mt-3 flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
        @click="dismiss"
      >
        {{ t('common.dismiss') }}
      </button>
    </div>
  </div>

  <!-- Other plan limits: full benefits body with upgrade CTA. -->
  <div
    v-else
    class="my-2 w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-4 shadow-sm ring-1 ring-neutral-950/5"
  >
    <UpgradePlanContent :payload="prompt.payload" />
    <div class="mt-4 flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        @click="dismiss"
      >
        {{ t('upgradePlan.notNow') }}
      </button>
      <PlanUpgradeButton :before-navigate="dismiss" />
    </div>
  </div>
</template>
