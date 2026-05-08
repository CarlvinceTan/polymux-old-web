<script setup lang="ts">
import { marked } from 'marked'

const props = withDefaults(
  defineProps<{
    docSlug: string
    pageTitle: string
    pageSubtitle: string
    showBack?: boolean
  }>(),
  { showBack: true },
)

const { data, error } = await useAsyncData(
  `legal-${props.docSlug}`,
  () =>
    $fetch<string>(`/api/legal/${props.docSlug}`, {
      responseType: 'text',
    }),
)

const html = computed(() => (data.value ? marked.parse(data.value) : ''))

const router = useRouter()
const canGoBack = ref(false)

onMounted(() => {
  canGoBack.value = window.history.length > 1
})

function goBack() {
  if (!import.meta.client) return
  if (window.history.length > 1) {
    router.back()
    return
  }
  navigateTo('/')
}
</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-[680px]">
      <button
        v-if="showBack && canGoBack"
        type="button"
        class="mb-6 flex size-9 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        aria-label="Go back"
        @click="goBack"
      >
        <svg
          class="size-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          {{ pageTitle }}
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          {{ pageSubtitle }}
        </p>
      </header>

      <div
        v-if="error"
        class="mt-12 text-center text-sm text-red-600"
        role="alert"
      >
        This document could not be loaded. Please try again later.
      </div>

      <article
        v-else
        class="legal-doc-body mt-12 text-left text-[1.0625rem] leading-relaxed text-neutral-800"
        v-html="html"
      />
    </div>
  </div>
</template>

<style scoped>
.legal-doc-body :deep(p) {
  margin-top: 0;
  margin-bottom: 1rem;
}

.legal-doc-body :deep(p:last-child) {
  margin-bottom: 0;
}

.legal-doc-body :deep(strong) {
  font-weight: 600;
  color: rgb(10 10 10);
}

.legal-doc-body :deep(h2) {
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: rgb(10 10 10);
}

.legal-doc-body :deep(h2:first-child) {
  margin-top: 0;
}

.legal-doc-body :deep(ul),
.legal-doc-body :deep(ol) {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
}

.legal-doc-body :deep(li) {
  margin-bottom: 0.375rem;
}

.legal-doc-body :deep(li:last-child) {
  margin-bottom: 0;
}

.legal-doc-body :deep(a) {
  color: rgb(10 10 10);
  text-decoration: underline;
  text-decoration-color: rgb(212 212 212);
  text-underline-offset: 2px;
  transition:
    color 150ms ease,
    text-decoration-color 150ms ease;
}

.legal-doc-body :deep(a:hover) {
  color: rgb(58 58 58);
  text-decoration-color: rgb(163 163 163);
}

.legal-doc-body :deep(hr) {
  margin: 2rem 0;
  border: 0;
  border-top: 1px solid rgb(229 229 229);
}

.legal-doc-body :deep(table) {
  width: 100%;
  margin: 1rem 0 1.25rem;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.legal-doc-body :deep(th),
.legal-doc-body :deep(td) {
  border: 1px solid rgb(229 229 229);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}

.legal-doc-body :deep(th) {
  font-weight: 600;
  background-color: rgb(250 250 250);
  color: rgb(10 10 10);
}

.legal-doc-body :deep(code) {
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background-color: rgb(245 245 245);
  color: rgb(23 23 23);
}

.legal-doc-body :deep(blockquote) {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 3px solid rgb(229 229 229);
  color: rgb(82 82 82);
}
</style>
