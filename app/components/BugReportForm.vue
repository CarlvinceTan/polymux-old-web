<script setup lang="ts">
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

  const t = title.value.trim()
  const e = email.value.trim()
  const m = message.value.trim()

  if (!t) { errorMessage.value = 'Please enter a title.'; return }
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { errorMessage.value = 'Please enter a valid email address.'; return }
  if (!m) { errorMessage.value = 'Please describe the bug.'; return }

  submitting.value = true
  try {
    await $fetch('/api/bug-report', { method: 'POST', body: { title: t, email: e, content: m } })
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
    errorMessage.value = msg || 'Something went wrong. Please try again.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="space-y-3.5 px-5 py-4" novalidate @submit.prevent="onSubmit">
    <div>
      <label for="bug-title" class="block text-xs font-medium text-neutral-600">Title</label>
      <input
        id="bug-title"
        v-model="title"
        type="text"
        autocomplete="off"
        placeholder="Brief description of the issue"
        class="mt-1.5 min-h-9 py-2 text-[13px]"
        :class="fieldClass"
        :disabled="submitting"
      >
    </div>

    <div>
      <label for="bug-email" class="block text-xs font-medium text-neutral-600">Email</label>
      <input
        id="bug-email"
        v-model="email"
        type="email"
        autocomplete="email"
        placeholder="your@email.com"
        class="mt-1.5 min-h-9 py-2 text-[13px]"
        :class="fieldClass"
        :disabled="submitting"
      >
    </div>

    <div>
      <label for="bug-message" class="block text-xs font-medium text-neutral-600">Message</label>
      <textarea
        id="bug-message"
        v-model="message"
        rows="4"
        placeholder="Steps to reproduce, what you expected, what happened instead…"
        class="mt-1.5 min-h-[6rem] resize-y py-2.5 text-[13px]"
        :class="fieldClass"
        :disabled="submitting"
      />
    </div>

    <p v-if="errorMessage" class="text-xs text-red-600" role="alert">{{ errorMessage }}</p>
    <p v-if="success" class="text-xs text-green-700" role="status">Bug report sent — thank you!</p>

    <button
      type="submit"
      class="w-full rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="submitting || success"
    >
      {{ submitting ? 'Sending…' : success ? 'Sent!' : 'Submit Report' }}
    </button>
  </form>
</template>
