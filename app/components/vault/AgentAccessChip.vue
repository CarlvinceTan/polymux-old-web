<script setup lang="ts">
import { useI18n } from '#imports'
import type { AgentAccessPolicy } from '~/composables/vault/usePasswords'

// Compact 3-state chip for a credential's agent-access policy. State is conveyed
// by glyph + label + colour (never colour alone):
//   - allowed          → check     → emerald
//   - consent_required → shield    → amber/gold (the DEFAULT for new credentials)
//   - blocked          → slash     → red/error
// Owners/admins get an inline Menu popover to change the policy; everyone else
// sees the chip read-only. The chip stays within the app's monochrome +
// emerald/gold/red palette and uses hairline borders.
const props = withDefaults(
  defineProps<{
    modelValue: AgentAccessPolicy
    editable?: boolean
    // When false, the chip never opens (used for saved sign-ins, which have no
    // per-credential gate) and renders without a caret.
    interactive?: boolean
  }>(),
  { editable: false, interactive: true },
)

const emit = defineEmits<{
  'update:modelValue': [value: AgentAccessPolicy]
}>()

const { t } = useI18n()

const open = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const canEdit = computed(() => props.editable && props.interactive)

const POLICIES: AgentAccessPolicy[] = ['allowed', 'consent_required', 'blocked']

interface ChipStyle {
  label: string
  // Static chip surface classes
  chip: string
  // Glyph colour
  glyph: string
}

const STYLES: Record<AgentAccessPolicy, ChipStyle> = {
  allowed: {
    label: 'vault.credentials.access.allowed',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    glyph: 'text-emerald-600',
  },
  consent_required: {
    label: 'vault.credentials.access.consentRequired',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    glyph: 'text-amber-600',
  },
  blocked: {
    label: 'vault.credentials.access.blocked',
    chip: 'border-error-200 bg-error-50 text-error-700',
    glyph: 'text-error-600',
  },
}

const current = computed(() => STYLES[props.modelValue])

function toggle() {
  if (!canEdit.value) return
  open.value = !open.value
}

function select(policy: AgentAccessPolicy) {
  open.value = false
  if (policy !== props.modelValue) emit('update:modelValue', policy)
}

function handleClickOutside(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (wrapperRef.value?.contains(target)) return
  // Menu teleports its panel to <body>; ignore clicks inside it.
  const panel = document.querySelector('.agent-access-popover')
  if (panel?.contains(target)) return
  open.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="wrapperRef" class="relative inline-flex">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-label-md font-medium transition-colors"
      :class="[current.chip, canEdit ? 'cursor-pointer hover:brightness-[0.98]' : 'cursor-default']"
      :aria-haspopup="canEdit ? 'menu' : undefined"
      :aria-expanded="canEdit ? open : undefined"
      :disabled="!canEdit"
      @click.stop="toggle"
    >
      <!-- allowed: check -->
      <svg v-if="modelValue === 'allowed'" class="size-3 shrink-0" :class="current.glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <!-- consent_required: shield with question -->
      <svg v-else-if="modelValue === 'consent_required'" class="size-3 shrink-0" :class="current.glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.7" />
        <path d="M12 16h.01" />
      </svg>
      <!-- blocked: circle slash -->
      <svg v-else class="size-3 shrink-0" :class="current.glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m5.6 5.6 12.8 12.8" />
      </svg>

      <span class="whitespace-nowrap">{{ t(current.label) }}</span>

      <svg v-if="canEdit" class="size-2.5 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Menu v-if="canEdit" :open="open" align="left" placement="below" width="w-56" compact>
      <div class="agent-access-popover py-1" @click.stop>
        <p class="px-3 pb-1.5 pt-1 text-meta font-medium uppercase tracking-wide text-neutral-400">
          {{ t('vault.credentials.access.title') }}
        </p>
        <button
          v-for="policy in POLICIES"
          :key="policy"
          type="button"
          class="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-100"
          @click="select(policy)"
        >
          <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center" :class="STYLES[policy].glyph">
            <svg v-if="policy === 'allowed'" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <svg v-else-if="policy === 'consent_required'" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.7" /><path d="M12 16h.01" /></svg>
            <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="text-nav font-medium text-neutral-950">{{ t(STYLES[policy].label) }}</span>
              <svg v-if="policy === modelValue" class="size-3.5 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
            <span class="mt-0.5 block text-meta leading-snug text-neutral-500">
              {{ t(`vault.credentials.access.${policy === 'consent_required' ? 'consentRequiredHint' : policy + 'Hint'}`) }}
            </span>
          </span>
        </button>
      </div>
    </Menu>
  </div>
</template>
