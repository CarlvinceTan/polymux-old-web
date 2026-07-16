<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type BrowserMode = 'server' | 'extension'

// modelValue / featureEnabled are retained for the browser-mode contract that
// PromptInput binds, but the browser-mode (Polymux server / local browser)
// toggle is no longer surfaced here.
//
// `context` decides which options this OPTIONS menu shows:
//   - 'workflow' (default): browser-agent options — currently just "Show cursor"
//     (the agent-cursor overlay over viewports).
//   - 'console': the general Chat assistant. It has no viewports, so the cursor
//     toggle is omitted. The OPTIONS button is STILL shown (so the affordance is
//     there), but its menu opens empty for now — Chat will get its own menu
//     items later.
const props = withDefaults(
  defineProps<{
    modelValue?: BrowserMode
    featureEnabled?: boolean
    context?: 'workflow' | 'console'
  }>(),
  { modelValue: 'server', featureEnabled: true, context: 'workflow' },
)

// Show-cursor is a workflow/viewport concern only — omitted in the Chat menu.
const showCursorOption = computed(() => props.context === 'workflow')

defineEmits<{
  'update:modelValue': [value: BrowserMode]
}>()

const { t } = useI18n()

// "Show cursor" — the agent-cursor overlay. Backed by the persisted
// `show_cursor_overlay` user setting via useUserSettings, which is a reactive
// singleton with an optimistic save, so flipping it shows/hides every agent
// cursor in realtime (even while a browser sub-agent is mid-run) and the choice
// sticks across sessions.
const { settings: userSettings, saveSettings } = useUserSettings()
const showCursorOverlay = computed(() => userSettings.value.show_cursor_overlay)
async function onShowCursorToggle(value: boolean) {
  try {
    await saveSettings({ show_cursor_overlay: value })
  }
  catch (e) {
    console.error('[options-menu] Error saving show_cursor_overlay:', e)
  }
}

const open = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

function closeMenu() {
  open.value = false
}

function toggleMenu() {
  open.value = !open.value
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
</script>

<template>
  <div ref="wrapperRef" class="relative inline-flex">
    <button
      type="button"
      class="inline-flex items-center gap-1 whitespace-nowrap transition-opacity hover:opacity-70"
      :aria-haspopup="true"
      :aria-expanded="open"
      @click.stop="toggleMenu"
    >
      <UIcon name="i-heroicons-adjustments-vertical-20-solid" class="shrink-0 size-3.5" />
      <span>{{ t('common.options').toUpperCase() }}</span>
    </button>
    <Menu :open="open" placement="above" align="center" width="w-64" compact>
      <!-- Show cursor — workflow/viewport only. -->
      <div
        v-if="showCursorOption"
        class="flex items-center justify-between gap-3 px-3 py-2.5"
        @click.stop
      >
        <div class="min-w-0 flex-1">
          <span class="block text-[13px] font-medium leading-snug text-neutral-900">
            {{ t('settings.showCursor') }}
          </span>
          <span class="mt-0.5 block text-[12px] leading-snug text-neutral-500">
            {{ t('settings.showCursorMenuHint') }}
          </span>
        </div>
        <SettingsToggle
          :model-value="showCursorOverlay"
          @update:model-value="onShowCursorToggle"
        />
      </div>
    </Menu>
  </div>
</template>
