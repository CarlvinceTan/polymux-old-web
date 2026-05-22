<script setup lang="ts">
const { t } = useI18n()
const user = useSupabaseUser()

const emit = defineEmits<{ close: [] }>()

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const success = ref(false)

const title = ref('')
const email = ref('')
const message = ref('')

const fieldClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none ring-neutral-950 transition-[box-shadow,border-color] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10'

watchEffect(() => {
  if (user.value?.email && !email.value) {
    email.value = user.value.email
  }
})

async function onSubmit() {
  if (!import.meta.client) return

  errorMessage.value = null
  success.value = false

  const titleTrimmed = title.value.trim()
  const emailTrimmed = email.value.trim()
  const messageTrimmed = message.value.trim()

  if (!titleTrimmed) { errorMessage.value = t('bugReport.errorTitle'); return }
  if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) { errorMessage.value = t('bugReport.errorEmail'); return }
  if (!messageTrimmed) { errorMessage.value = t('bugReport.errorMessage'); return }

  submitting.value = true
  try {
    await $fetch('/api/bug-report', { method: 'POST', body: { title: titleTrimmed, email: emailTrimmed, content: messageTrimmed } })
    success.value = true
    title.value = ''
    message.value = ''
    setTimeout(() => {
      success.value = false
      errorMessage.value = null
      emit('close')
    }, 2000)
  }
  catch (err: unknown) {
    let msg: string | null = null
    if (err && typeof err === 'object' && 'data' in err && err.data && typeof err.data === 'object') {
      const d = err.data as Record<string, unknown>
      if (typeof d.statusMessage === 'string') msg = d.statusMessage
      else if (typeof d.message === 'string') msg = d.message
    }
    errorMessage.value = msg || t('bugReport.errorGeneric')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="space-y-3.5 px-5 py-4" novalidate @submit.prevent="onSubmit">
    <div>
      <label for="bug-title" class="block text-xs font-medium text-neutral-600">{{ t('bugReport.titleLabel') }}</label>
      <input
        id="bug-title"
        v-model="title"
        type="text"
        autocomplete="off"
        :placeholder="t('bugReport.titlePlaceholder')"
        class="mt-1.5 min-h-9 py-2 text-[13px]"
        :class="fieldClass"
        :disabled="submitting"
      >
    </div>

    <div>
      <label for="bug-email" class="block text-xs font-medium text-neutral-600">{{ t('common.email') }}</label>
      <input
        id="bug-email"
        v-model="email"
        type="email"
        autocomplete="email"
        :placeholder="t('bugReport.emailPlaceholder')"
        class="mt-1.5 min-h-9 py-2 text-[13px]"
        :class="fieldClass"
        :disabled="submitting"
      >
    </div>

    <div>
      <label for="bug-message" class="block text-xs font-medium text-neutral-600">{{ t('bugReport.messageLabel') }}</label>
      <textarea
        id="bug-message"
        v-model="message"
        rows="4"
        :placeholder="t('bugReport.messagePlaceholder')"
        class="mt-1.5 min-h-[6rem] resize-y py-2.5 text-[13px]"
        :class="fieldClass"
        :disabled="submitting"
      />
    </div>

    <p v-if="errorMessage" class="text-xs text-red-600" role="alert">{{ errorMessage }}</p>
    <p v-if="success" class="text-xs text-green-700" role="status">{{ t('bugReport.success') }}</p>

    <button
      type="submit"
      class="w-full rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="submitting || success"
    >
      {{ submitting ? t('bugReport.sending') : success ? t('bugReport.sent') : t('bugReport.submit') }}
    </button>
  </form>
</template>
