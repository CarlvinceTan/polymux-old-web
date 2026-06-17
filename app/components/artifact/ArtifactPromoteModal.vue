<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const isOpen = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  artifact: SandboxArtifact | null
}>()

const emit = defineEmits<{
  confirm: [path: string]
}>()

const { t } = useI18n()

const path = ref('')
const submitting = ref(false)
const error = ref('')

const trimmed = computed(() => path.value.trim().replace(/^\/+/, ''))
const canSubmit = computed(() => trimmed.value.length > 0 && !submitting.value)

watch(
  () => props.artifact,
  (artifact) => {
    error.value = ''
    submitting.value = false
    path.value = artifact ? artifact.name : ''
  },
)

function handleClose() {
  if (submitting.value) return
  isOpen.value = false
  error.value = ''
}

async function handleConfirm() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  try {
    emit('confirm', trimmed.value)
  }
  catch {
    submitting.value = false
  }
}

defineExpose({
  reset() {
    submitting.value = false
    error.value = ''
  },
  fail(message: string) {
    submitting.value = false
    error.value = message
  },
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') handleClose()
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

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
          v-if="isOpen"
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
              v-if="isOpen"
              class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
              role="dialog"
              aria-modal="true"
              :aria-label="t('artifacts.promoteTitle')"
              @click.stop
            >
              <div class="px-5 pt-5 pb-4">
                <h2 class="text-sm font-semibold text-neutral-900">
                  {{ t('artifacts.promoteTitle') }}
                </h2>
                <p class="mt-1.5 text-xs leading-relaxed text-neutral-600">
                  {{ t('artifacts.promoteDescription') }}
                </p>
                <div class="mt-4">
                  <label class="block text-xs font-medium text-neutral-500 mb-1.5">
                    {{ t('artifacts.promotePathLabel') }}
                  </label>
                  <input
                    v-model="path"
                    name="artifact-path"
                    type="text"
                    :placeholder="artifact?.name ?? ''"
                    autofocus
                    class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm font-mono text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    @keydown.enter.prevent="handleConfirm"
                  />
                  <p v-if="error" class="mt-1.5 text-xs text-red-600">{{ error }}</p>
                  <p v-else class="mt-1.5 text-xs text-neutral-400">
                    {{ t('artifacts.promotePathHint') }}
                  </p>
                </div>
              </div>
              <div class="flex justify-end gap-2 px-5 py-3.5">
                <button
                  type="button"
                  class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  :disabled="submitting"
                  @click="handleClose"
                >
                  {{ t('common.cancel') }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  :disabled="!canSubmit"
                  @click="handleConfirm"
                >
                  {{ submitting ? t('artifacts.promoting') : t('artifacts.promoteConfirm') }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
