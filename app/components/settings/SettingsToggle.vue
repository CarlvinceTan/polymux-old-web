<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: boolean
  disabled?: boolean
}>(), {
  modelValue: undefined,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="props.modelValue"
    :aria-disabled="props.disabled || undefined"
    :disabled="props.disabled"
    class="settings-toggle"
    :class="{
      'settings-toggle--on': props.modelValue,
      'settings-toggle--disabled': props.disabled,
    }"
    @click="toggle"
  >
    <span class="settings-toggle__thumb" />
  </button>
</template>

<style scoped>
.settings-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 2rem;
  height: 1.125rem;
  border-radius: 9999px;
  background-color: var(--color-neutral-300);
  padding: 0.125rem;
  transition: background-color 150ms ease, opacity 150ms ease;
  cursor: pointer;
  flex-shrink: 0;
  border: none;
  outline-offset: 2px;
}

.settings-toggle:focus-visible {
  outline: 2px solid var(--color-neutral-950);
}

.settings-toggle--on {
  background-color: var(--color-neutral-950);
}

.settings-toggle--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-toggle__thumb {
  display: block;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  background-color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transform: translateX(0);
  transition: transform 150ms ease;
}

.settings-toggle--on .settings-toggle__thumb {
  transform: translateX(0.875rem);
}
</style>
