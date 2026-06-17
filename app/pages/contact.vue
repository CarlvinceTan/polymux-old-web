<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useI18n()

useHead({
  title: () => t('contact.metaTitle'),
  meta: [
    {
      name: 'description',
      content: () => t('contact.metaDescription'),
    },
  ],
})
const route = useRoute()

const title = ref('')
const email = ref('')
const content = ref('')

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const success = ref(false)

const fieldClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none ring-neutral-950 transition-[box-shadow,border-color] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10'

async function onSubmit() {
  if (!import.meta.client) return

  errorMessage.value = null
  success.value = false

  const titleTrimmed = title.value.trim()
  const emailTrimmed = email.value.trim()
  const contentTrimmed = content.value.trim()

  if (!titleTrimmed) {
    errorMessage.value = t('contact.errorTitle')
    return
  }
  if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    errorMessage.value = t('contact.errorEmail')
    return
  }
  if (!contentTrimmed) {
    errorMessage.value = t('contact.errorContent')
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/contact', {
      method: 'POST',
      body: { title: titleTrimmed, email: emailTrimmed, content: contentTrimmed },
    })
    success.value = true
    title.value = ''
    email.value = ''
    content.value = ''
  } catch (err: unknown) {
    let msg: string | null = null
    if (err && typeof err === 'object' && 'data' in err && err.data && typeof err.data === 'object') {
      const d = err.data as Record<string, unknown>
      if (typeof d.statusMessage === 'string') msg = d.statusMessage
      else if (typeof d.message === 'string') msg = d.message
    }
    errorMessage.value = msg || t('contact.error')
  } finally {
    submitting.value = false
  }
}

function applyEnterprisePlanPrefill() {
  if (route.query.from === 'enterprise-plan') {
    title.value = t('contact.enterprisePrefill')
  }
}

onMounted(applyEnterprisePlanPrefill)
watch(
  () => route.query.from,
  () => applyEnterprisePlanPrefill(),
)
</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-[680px]">
      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          {{ t('contact.title') }}
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          {{ t('contact.subtitle') }}
        </p>
      </header>

      <form
        class="mx-auto mt-12 max-w-lg space-y-6"
        novalidate
        @submit.prevent="onSubmit"
      >
        <div>
          <label for="contact-title" class="block text-sm font-medium text-neutral-800">
            {{ t('contact.titleField') }}
          </label>
          <input
            id="contact-title"
            v-model="title"
            type="text"
            name="title"
            autocomplete="off"
            :placeholder="t('contact.titlePlaceholder')"
            class="mt-2 min-h-11"
            :class="fieldClass"
            :disabled="submitting"
          >
        </div>

        <div>
          <label for="contact-email" class="block text-sm font-medium text-neutral-800">
            {{ t('common.email') }}
          </label>
          <input
            id="contact-email"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            :placeholder="t('contact.emailPlaceholder')"
            class="mt-2 min-h-11"
            :class="fieldClass"
            :disabled="submitting"
          >
        </div>

        <div>
          <label for="contact-content" class="block text-sm font-medium text-neutral-800">
            {{ t('contact.contentField') }}
          </label>
          <textarea
            id="contact-content"
            v-model="content"
            name="content"
            rows="6"
            :placeholder="t('contact.contentPlaceholder')"
            class="mt-2 min-h-[9.5rem] resize-y py-3"
            :class="fieldClass"
            :disabled="submitting"
          />
        </div>

        <p
          v-if="errorMessage"
          class="text-sm text-red-600"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p
          v-if="success"
          class="text-sm text-green-700"
          role="status"
        >
          {{ t('contact.success') }}
        </p>

        <div class="flex justify-center">
          <button
            type="submit"
            class="min-h-11 w-full rounded-lg bg-neutral-950 px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-36"
            :disabled="submitting"
          >
            {{ submitting ? t('contact.sending') : t('contact.send') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
