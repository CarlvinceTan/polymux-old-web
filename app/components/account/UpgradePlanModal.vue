<script setup lang="ts">
import type { UpgradePlanPayload } from '~/types/upgradePlan'
import {
  suggestedUpgradePlan,
  upgradePlanReasonKey,
} from '~/composables/account/useUpgradePlanModal'
import type { PlanUpgradePlanKey } from '~/composables/account/usePlanUpgradeNavigation'

const props = defineProps<{
  open: boolean
  payload: UpgradePlanPayload | null
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const { t } = useI18n()
const { currentWorkspace } = useWorkspaces()
const { planKey } = usePlanUpgradeNavigation()

const nextPlan = computed<PlanUpgradePlanKey | null>(() =>
  suggestedUpgradePlan(props.payload?.plan ?? currentWorkspace.value?.plan),
)

const reasonTitle = computed(() => {
  if (!props.payload) return t('upgradePlan.title')
  return t(`${upgradePlanReasonKey(props.payload.reason)}.title`)
})

const reasonBody = computed(() => {
  if (!props.payload) return t('upgradePlan.subtitle')
  const key = upgradePlanReasonKey(props.payload.reason)
  const cap = props.payload.cap
  if (props.payload.reason === 'member_limit' && cap != null && cap > 0) {
    return t(`${key}.bodyWithCap`, { cap })
  }
  if (props.payload.reason === 'browser_agent_limit' && cap != null && cap > 0) {
    return t(`${key}.bodyWithCap`, { cap })
  }
  if (props.payload.message?.trim()) return props.payload.message
  return t(`${key}.body`)
})

const benefitLines = computed(() => {
  const target = nextPlan.value
  if (!target) {
    return [t('upgradePlan.benefits.contactSales')]
  }
  const planName = t(`upgradePlan.planNames.${target}`)
  return [
    t('upgradePlan.benefits.agents', { plan: planName, count: planAgentCap(target) }),
    t('upgradePlan.benefits.tokens', { plan: planName, count: planTokenLabel(target) }),
    t('upgradePlan.benefits.cloud', { plan: planName, size: planCloudLabel(target) }),
    t('upgradePlan.benefits.members', { plan: planName, count: planMemberCap(target) }),
  ]
})

function planAgentCap(plan: PlanUpgradePlanKey): number {
  switch (plan) {
    case 'free':
      return 2
    case 'pro':
      return 8
    case 'max':
      return 20
    case 'enterprise':
      return 50
  }
}

function planTokenLabel(plan: PlanUpgradePlanKey): string {
  switch (plan) {
    case 'free':
      return '100K'
    case 'pro':
      return '2M'
    case 'max':
      return '5M'
    case 'enterprise':
      return t('upgradePlan.unlimited')
  }
}

function planCloudLabel(plan: PlanUpgradePlanKey): string {
  switch (plan) {
    case 'free':
      return '—'
    case 'pro':
      return '2 GB'
    case 'max':
      return '20 GB'
    case 'enterprise':
      return '200 GB'
  }
}

function planMemberCap(plan: PlanUpgradePlanKey): string {
  switch (plan) {
    case 'free':
      return '3'
    case 'pro':
      return '10'
    case 'max':
      return '50'
    case 'enterprise':
      return t('upgradePlan.custom')
  }
}

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
              <header class="flex flex-col gap-3 px-6 pb-2 pt-6">
                <div
                  class="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 via-yellow-100 to-amber-200 ring-1 ring-gold/20"
                >
                  <PolymuxLogo class="size-6 text-gold" />
                </div>
                <h2 class="text-title-sm font-semibold tracking-tight text-neutral-950">
                  {{ reasonTitle }}
                </h2>
                <p class="text-body-md leading-relaxed text-neutral-600">
                  {{ reasonBody }}
                </p>
              </header>

              <div class="px-6 pb-2">
                <p class="mb-2 text-label-md font-semibold uppercase tracking-wide text-neutral-500">
                  {{ t('upgradePlan.benefitsHeading') }}
                </p>
                <ul class="space-y-1.5 text-body-md text-neutral-700">
                  <li
                    v-for="(line, index) in benefitLines"
                    :key="index"
                    class="flex gap-2"
                  >
                    <UIcon name="i-heroicons-check-circle-20-solid" class="mt-0.5 size-4 shrink-0 text-gold" />
                    <span>{{ line }}</span>
                  </li>
                </ul>
                <p
                  v-if="nextPlan"
                  class="mt-3 text-label-md text-neutral-500"
                >
                  {{ t('upgradePlan.currentPlanNote', { current: t(`upgradePlan.planNames.${planKey}`) }) }}
                </p>
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
