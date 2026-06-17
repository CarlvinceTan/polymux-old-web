<script setup lang="ts">
import type { Ref } from 'vue'
import type { BrowserMode } from '~/components/chat/BrowserModeMenu.vue'

// Stealth tab: per-session anti-detection controls for this workflow's browser
// agents. State is owned + persisted by the parent workflow page and injected
// here (same pattern as chat-browser-mode), so it survives Agent/Schedule/
// Artifacts/Stealth tab swaps.
const { t } = useI18n()

const browserMode = inject<Ref<BrowserMode>>('chat-browser-mode', ref<BrowserMode>('server'))
const humanizeEnabled = inject<Ref<boolean>>('chat-humanize-enabled', ref(true))
const cloakedEnabled = inject<Ref<boolean>>('chat-cloaked-enabled', ref(true))

// In extension mode the agent drives the user's own Chrome, so neither cloaking
// nor humanising apply — both toggles grey out and the banner explains why.
const isExtension = computed(() => browserMode.value === 'extension')

const modeLabel = computed(() =>
  isExtension.value ? t('browser.modeLocalBrowser') : t('browser.modeServer'),
)

// Dynamic detection-risk banner (treatment B): one amber line consolidating
// whichever protections are currently lowered.
const riskBanner = computed<string | null>(() => {
  if (isExtension.value) return t('stealth.risk.extension')
  const h = !humanizeEnabled.value
  const c = !cloakedEnabled.value
  if (h && c) return t('stealth.risk.both')
  if (h) return t('stealth.risk.humanizer')
  if (c) return t('stealth.risk.cloaked')
  return null
})
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <template #title>
      <div class="truncate text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
        {{ t('stealth.title') }}
      </div>
    </template>

    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
        <!-- Detection-risk banner (treatment B) -->
        <div
          v-if="riskBanner"
          role="status"
          class="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-700"
        >
          <UIcon
            name="i-heroicons-exclamation-triangle-20-solid"
            class="mt-0.5 size-4 shrink-0 text-amber-500"
          />
          <span>{{ riskBanner }}</span>
        </div>

        <SettingsSection>
          <!-- Browser mode — read-only context (set from the chat input) -->
          <SettingsSectionRow>
            <template #label>{{ t('stealth.mode.label') }}</template>
            <template #description>{{ t('stealth.mode.description') }}</template>
            <template #trailing>{{ modeLabel }}</template>
          </SettingsSectionRow>

          <!-- Cloaked browser -->
          <SettingsSectionRow>
            <template #label>
              <span :class="isExtension ? 'opacity-50' : ''">{{ t('stealth.cloaked.label') }}</span>
            </template>
            <template #description>
              <span :class="isExtension ? 'opacity-50' : ''">{{ t('stealth.cloaked.description') }}</span>
            </template>
            <template #trailing>
              <SettingsToggle
                :model-value="cloakedEnabled"
                :disabled="isExtension"
                @update:model-value="cloakedEnabled = $event"
              />
            </template>
          </SettingsSectionRow>

          <!-- Agent Humaniser -->
          <SettingsSectionRow>
            <template #label>
              <span :class="isExtension ? 'opacity-50' : ''">{{ t('stealth.humanizer.label') }}</span>
            </template>
            <template #description>
              <span :class="isExtension ? 'opacity-50' : ''">{{ t('stealth.humanizer.description') }}</span>
            </template>
            <template #trailing>
              <SettingsToggle
                :model-value="humanizeEnabled"
                :disabled="isExtension"
                @update:model-value="humanizeEnabled = $event"
              />
            </template>
          </SettingsSectionRow>
        </SettingsSection>
      </div>
    </div>
  </TabPanel>
</template>
