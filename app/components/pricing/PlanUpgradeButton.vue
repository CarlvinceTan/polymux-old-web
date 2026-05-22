<script setup lang="ts">
/**
 * Primary CTA for sending the user to /pricing with the current workspace
 * encoded in the query. Uses client-side navigation so the pricing page back
 * control returns to the previous in-app route.
 */
const props = defineProps<{
  /** Runs before navigation (e.g. close a modal). */
  beforeNavigate?: () => void
  disabled?: boolean
}>()

const { t } = useI18n()
const { navigateToPricing } = usePlanUpgradeNavigation()

function onClick() {
  props.beforeNavigate?.()
  void navigateToPricing()
}
</script>

<template>
  <button
    type="button"
    class="shrink-0 rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
    :disabled="disabled"
    @click="onClick"
  >
    <slot>{{ t('common.upgrade') }}</slot>
  </button>
</template>
