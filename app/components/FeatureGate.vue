<script setup lang="ts">
// Wrap UI that should only render when a PostHog feature flag is enabled.
// Usage: <FeatureGate name="workflows">…</FeatureGate>
// When the flag is off, renders the #placeholder slot, or a default message.

const props = defineProps<{
  name: string
  placeholderTitle?: string
  placeholderBody?: string
}>()

const { isEnabled } = useMeFeatures()
const enabled = computed(() => isEnabled(props.name))
const { t } = useI18n()
</script>

<template>
  <slot v-if="enabled" />
  <div v-else class="featuregate-placeholder">
    <slot name="placeholder">
      <div class="featuregate-default">
        <h2>{{ placeholderTitle || t('featureUnavailableTitle') }}</h2>
        <p>{{ placeholderBody || t('featureUnavailableBody') }}</p>
      </div>
    </slot>
  </div>
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
