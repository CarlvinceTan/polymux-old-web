<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useExtensionStatus } from '~/composables/extension/useExtensionStatus'

export type BrowserMode = 'server' | 'extension'

const props = withDefaults(
  defineProps<{
    modelValue?: BrowserMode
    /**
     * Whether the extension-mode feature is globally enabled (PostHog
     * `extension_mode`). When false the menu still renders so the SETTINGS
     * affordance stays in place, but the toggle is locked to Server and a
     * short copy line explains why — hiding the menu outright was confusing
     * because the chip would vanish without trace.
     */
    featureEnabled?: boolean
  }>(),
  { modelValue: 'server', featureEnabled: true },
)

const emit = defineEmits<{
  'update:modelValue': [value: BrowserMode]
}>()

const { t } = useI18n()
const { state, refresh } = useExtensionStatus()

const open = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

// Two distinct "you can't pick extension" states that share the toggle UI:
//   - extensionUnavailable: the user's browser/extension isn't responding
//     (no pairing, popup not opened, etc.). Recoverable via Connect.
//   - featureGloballyOff: the org-level `extension_mode` PostHog flag is
//     false. No user action will help — just an FYI.
// The disabled style applies to both; the body copy below differs.
const extensionUnavailable = computed(() => state.value === 'unavailable')
const featureGloballyOff = computed(() => !props.featureEnabled)
const extensionDisabled = computed(
  () => extensionUnavailable.value || featureGloballyOff.value,
)

const modeLabel = computed(() =>
  props.modelValue === 'server'
    ? t('browser.modeServer')
    : t('browser.modeLocalBrowser'),
)

function openMenu() {
  open.value = true
  // Skip the extension-status probe when the feature flag itself is off —
  // the menu won't surface a Connect affordance, so the result is unused.
  if (!featureGloballyOff.value) {
    void refresh(true)
  }
}

function closeMenu() {
  open.value = false
}

function toggleMenu() {
  if (open.value) closeMenu()
  else openMenu()
}

function onServerToggle(serverOn: boolean) {
  if (!serverOn && extensionDisabled.value) return
  const next: BrowserMode = serverOn ? 'server' : 'extension'
  if (props.modelValue !== next) emit('update:modelValue', next)
}

function handleClickOutside(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (!target) return
  if (wrapperRef.value && wrapperRef.value.contains(target)) return
  closeMenu()
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) closeMenu()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKey)
})

watch(
  [() => props.modelValue, state, featureGloballyOff],
  ([mode, current, off]) => {
    // Force-reset to server when the extension chrome is unreachable; the
    // global-off case is intentionally not auto-rewritten (see PromptInput),
    // so the disabled message keeps explaining what changed.
    if (mode === 'extension' && current === 'unavailable' && !off) {
      emit('update:modelValue', 'server')
    }
  },
  { immediate: true },
)
</script>

<template>
  <div ref="wrapperRef" class="relative inline-flex">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex items-center gap-1 whitespace-nowrap transition-opacity hover:opacity-70"
      :aria-haspopup="true"
      :aria-expanded="open"
      @click.stop="toggleMenu"
    >
      <UIcon name="i-heroicons-adjustments-vertical-20-solid" class="shrink-0 size-3.5" />
      <span>{{ t('common.settings').toUpperCase() }}</span>
    </button>
    <Menu :open="open" placement="above" align="center" width="w-64" compact>
      <div
        class="flex items-center justify-between gap-3 px-3 py-2.5"
        @click.stop
      >
        <span
          class="min-w-0 flex-1 text-[13px] font-medium leading-snug text-neutral-900"
          :class="extensionDisabled ? 'text-neutral-500' : ''"
        >
          {{ modeLabel }}
        </span>
        <SettingsToggle
          :model-value="modelValue === 'server'"
          :disabled="extensionDisabled"
          @update:model-value="onServerToggle"
        />
      </div>
      <div
        v-if="featureGloballyOff"
        class="border-t border-neutral-100 px-3 py-2 text-[12px] leading-snug text-neutral-500"
        @click.stop
      >
        {{ t('browser.extensionFeatureDisabled') }}
      </div>
    </Menu>
  </div>
</template>
