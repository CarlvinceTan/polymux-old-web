<script setup lang="ts">
import { useI18n } from '#imports'

const props = defineProps<{
  open: boolean
  passwordId: string
  name: string
  url: string
  username: string
  savedByName: string
  lastUsedByName?: string | null
  lastUsed?: string
  createdAt?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  edit: []
}>()

const { t, locale } = useI18n()

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return ''
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  if (diffSec < 60) return rtf.format(-diffSec, 'second')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return rtf.format(-diffHr, 'hour')
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return rtf.format(-diffDay, 'day')
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return rtf.format(-diffMo, 'month')
  return new Date(then).toLocaleDateString(locale.value)
}

const lastUsedAgo = computed(() => timeAgo(props.lastUsed))
const createdAgo = computed(() => timeAgo(props.createdAt))
const { copy, copied } = useClipboard()

const imgError = ref(false)

// Identity shown in the header — favicon + readable hostname — mirrors the card.
const normalizedUrl = computed(() =>
  props.url.startsWith('http') ? props.url : `https://${props.url}`,
)
const hostname = computed(() => {
  try {
    return new URL(normalizedUrl.value).hostname.replace(/^www\./, '')
  }
  catch {
    return props.url
  }
})
const faviconSrc = computed(() => {
  try {
    return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(normalizedUrl.value).hostname}`
  }
  catch {
    return `https://www.google.com/s2/favicons?sz=64&domain=${props.url}`
  }
})

// Per-field copy feedback: a single useClipboard `copied` flag is shared, so we
// track which row was last copied to scope the checkmark to that row.
const copiedField = ref<string | null>(null)
function copyField(field: string, value: string | null | undefined) {
  if (!value) return
  copy(value)
  copiedField.value = field
}
watch(copied, (v) => { if (!v) copiedField.value = null })

function handleClose() {
  copiedField.value = null
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) handleClose()
}

watch(() => props.open, (val) => {
  if (!val) copiedField.value = null
})

// Different account selected while the modal stays mounted — retry its favicon.
watch(() => props.url, () => { imgError.value = false })

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="handleClose"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="props.open"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white modal-surface"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <!-- Header: favicon + name + hostname -->
            <div class="relative flex items-start gap-3 px-5 pt-5 pb-4">
              <div class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                <img
                  v-if="!imgError"
                  :src="faviconSrc"
                  :alt="name"
                  class="size-6 object-contain"
                  @error="imgError = true"
                >
                <svg
                  v-else
                  class="size-6 text-neutral-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="7.5" cy="15.5" r="5.5" />
                  <path d="m21 2-9.6 9.6" />
                  <path d="m15.5 7.5 3 3L22 7l-3-3" />
                </svg>
              </div>

              <div class="min-w-0 flex-1 pr-6">
                <h2 class="truncate text-base font-semibold text-neutral-900">{{ name }}</h2>
                <p class="truncate text-meta text-neutral-500">{{ hostname }}</p>
              </div>

              <button
                type="button"
                class="absolute right-4 top-4 text-neutral-400 transition-colors hover:text-neutral-700"
                :aria-label="t('common.close')"
                @click="handleClose"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <!-- Credential fields -->
            <div class="px-5">
              <div class="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
                <!-- URL -->
                <div class="flex items-center gap-2 px-3.5 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium text-neutral-500">{{ t('vault.passwords.urlLabel') }}</p>
                    <p class="truncate text-sm text-neutral-950">{{ url }}</p>
                  </div>
                  <a
                    :href="normalizedUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex size-8 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-950"
                    :aria-label="t('vault.passwords.openSite')"
                    :title="t('vault.passwords.openSite')"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                  </a>
                  <button
                    type="button"
                    class="flex size-8 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-950"
                    :aria-label="t('common.copy')"
                    @click="copyField('url', url)"
                  >
                    <svg v-if="copiedField === 'url'" class="size-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  </button>
                </div>

                <!-- Username -->
                <div class="flex items-center gap-2 px-3.5 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium text-neutral-500">{{ t('vault.passwords.usernameLabel') }}</p>
                    <p class="truncate text-sm text-neutral-950">{{ username }}</p>
                  </div>
                  <button
                    type="button"
                    class="flex size-8 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-950"
                    :aria-label="t('common.copy')"
                    @click="copyField('username', username)"
                  >
                    <svg v-if="copiedField === 'username'" class="size-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  </button>
                </div>

                <!-- Password — encrypted at rest; never revealed or copied from the UI -->
                <div class="flex items-center gap-2 px-3.5 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium text-neutral-500">{{ t('vault.passwords.passwordLabel') }}</p>
                    <p class="truncate font-mono text-sm tracking-wider text-neutral-400">••••••••••••</p>
                  </div>
                  <svg class="size-4 shrink-0 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </div>

              </div>
              <p class="mt-2 px-1 text-xs text-neutral-400">{{ t('vault.passwords.passwordsLockedNote') }}</p>
            </div>

            <!-- Details -->
            <div class="px-5 pb-5 pt-4">
              <p class="mb-2 text-xs font-medium text-neutral-500">{{ t('vault.passwords.detailsSection') }}</p>
              <div class="space-y-1.5 text-sm text-neutral-600">
                <p>{{ t('vault.passwords.savedBy', { name: savedByName }) }}</p>
                <p v-if="createdAgo">
                  {{ t('vault.passwords.savedAt', { when: createdAgo }) }}
                </p>
                <p v-if="lastUsedByName && lastUsedAgo">
                  {{ t('vault.passwords.lastUsedBy', { name: lastUsedByName, when: lastUsedAgo }) }}
                </p>
                <p v-else-if="lastUsedAgo" class="text-neutral-500">
                  {{ t('vault.passwords.lastUsedAt', { when: lastUsedAgo }) }}
                </p>
              </div>
            </div>

            <div class="flex items-center justify-between gap-2 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                @click="emit('edit')"
              >
                {{ t('vault.passwords.edit') }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                @click="handleClose"
              >
                {{ t('common.close') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
