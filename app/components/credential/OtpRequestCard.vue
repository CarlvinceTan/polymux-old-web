<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatOtpRequest } from '~/composables/types'
import { extractCredentialHost } from '~/composables/vault/credentialSiteMatch'

/**
 * Inline chat card for RequestOtp — the human-in-the-loop second factor. The
 * agent hit a 2FA wall; the user reads the current one-time code from their own
 * authenticator / SMS / email and enters it here. The field is deliberately
 * free-form (no fixed length or digits-only): codes vary by provider. The code
 * is sent to the server, which injects it into the browser fill below the model
 * — it never travels through the model or the transcript.
 */
const props = defineProps<{
  request: ChatOtpRequest
}>()

const emit = defineEmits<{
  submit: [value: { code: string }]
  cancel: []
}>()

const { t } = useI18n()

const code = ref('')
const submitting = ref(false)

const siteHost = computed(() => extractCredentialHost(props.request.site) || props.request.site)
const isPending = computed(() => props.request.status === 'pending')

function handleSubmit() {
  const c = code.value.trim()
  if (!c || submitting.value) return
  submitting.value = true
  emit('submit', { code: c })
}

function handleCancel() {
  if (submitting.value) return
  emit('cancel')
}
</script>

<template>
  <div
    data-testid="otp-request-card"
    class="my-2 w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-4 shadow-sm ring-1 ring-neutral-950/5"
    :class="isPending ? '' : 'opacity-90'"
  >
    <template v-if="!isPending">
      <p class="text-sm text-neutral-700">
        {{ request.status === 'cancelled'
          ? t('otpRequest.cancelledSummary', { site: siteHost || request.site })
          : t('otpRequest.completedSummary', { site: siteHost || request.site }) }}
      </p>
    </template>

    <template v-else>
      <div class="mb-3 flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <i18n-t keypath="otpRequest.heading" tag="h3" class="text-sm font-semibold text-neutral-900">
            <template #site>
              <span class="text-neutral-700">{{ siteHost || request.site }}</span>
            </template>
          </i18n-t>
          <p class="mt-0.5 text-xs text-neutral-500">{{ request.purpose }}</p>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('otpRequest.codeLabel') }}</label>
        <input
          v-model="code"
          data-testid="otp-code"
          name="otp-code"
          autocomplete="one-time-code"
          inputmode="text"
          :placeholder="t('otpRequest.codePlaceholder')"
          class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 font-mono text-sm tracking-wider text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:font-sans placeholder:tracking-normal placeholder:text-neutral-400"
          @keyup.enter="handleSubmit"
        >
        <p class="mt-1 text-xs text-neutral-400">{{ t('otpRequest.hint') }}</p>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          :disabled="submitting"
          @click="handleCancel"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          data-testid="otp-submit"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="!code.trim() || submitting"
          @click="handleSubmit"
        >
          {{ submitting ? t('otpRequest.working') : t('otpRequest.submit') }}
        </button>
      </div>
    </template>
  </div>
</template>
