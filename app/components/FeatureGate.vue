<script setup lang="ts">
// Wrap UI that should only render when a PostHog feature flag is enabled.
// Usage: <FeatureGate name="workflows">…</FeatureGate>
// Flag evaluation goes through useMeFeatures.isEnabled(), which applies
// per-key policy (opt-in for wallet/extension_mode; fail-open for
// plan_limits, account_access, and FeatureGate page keys).

const props = defineProps<{
  name: string
  placeholderTitle?: string
  placeholderBody?: string
}>()

const { isEnabled, ready } = useMeFeatures()
const enabled = computed(() => isEnabled(props.name))
const { t } = useI18n()

// Avoid SSR/client hydration mismatch: until mount, match SSR (always render the
// default slot). After mount, wait for PostHog before choosing slot vs placeholder.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const showFeatureLoading = computed(
  () => import.meta.client && mounted.value && !ready.value,
)
const showPlaceholder = computed(
  () => import.meta.client && mounted.value && ready.value && !enabled.value,
)
</script>

<template>
  <div
    v-if="showFeatureLoading"
    class="featuregate-loading min-h-[50vh] w-full"
    aria-busy="true"
    aria-live="polite"
  />
  <div v-else-if="showPlaceholder" class="featuregate-placeholder">
    <slot name="placeholder">
      <div class="featuregate-default">
        <h2>{{ placeholderTitle || t('featureUnavailableTitle') }}</h2>
        <p>{{ placeholderBody || t('featureUnavailableBody') }}</p>
      </div>
    </slot>
  </div>
  <slot v-else />
</template>

<style scoped>
.featuregate-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 50vh;
  padding: 2rem;
}
.featuregate-default {
  max-width: 28rem;
  text-align: center;
  color: var(--color-text-secondary, #888);
}
.featuregate-default h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary, #eee);
}
.featuregate-default p {
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
