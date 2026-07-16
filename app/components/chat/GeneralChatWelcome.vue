<script setup lang="ts">
import { computed } from 'vue'

// Centred empty-state for the general chat (/chat/{id}): a personalised
// greeting, the real PromptInput (injected via the default slot so it stays
// wired to the chat and keeps its normal left-aligned content), and a 2×2 grid
// of suggested actions that prefill the composer.

const { t } = useI18n()

defineProps<{
  userName: string
}>()

const emit = defineEmits<{
  select: [prompt: string]
}>()

// Labels, descriptions and the prefilled prompt all come from i18n
// (chat.welcomeSuggestions.*) so they localise like the welcome chip; icons are
// heroicons names rendered through Nuxt UI's UIcon.
const SUGGESTIONS = [
  { key: 'automate', icon: 'i-heroicons-bolt-20-solid' },
  { key: 'browse', icon: 'i-heroicons-globe-alt-20-solid' },
  { key: 'summarize', icon: 'i-heroicons-document-text-20-solid' },
  { key: 'draft', icon: 'i-heroicons-paper-airplane-20-solid' },
] as const

const suggestions = computed(() =>
  SUGGESTIONS.map(s => ({
    key: s.key,
    icon: s.icon,
    title: t(`chat.welcomeSuggestions.${s.key}.title`),
    description: t(`chat.welcomeSuggestions.${s.key}.description`),
    prompt: t(`chat.welcomeSuggestions.${s.key}.prompt`),
  })),
)
</script>

<template>
  <div class="flex w-full max-w-2xl flex-col items-center gap-7">
    <div class="flex flex-col items-center gap-2 text-center">
      <i18n-t
        keypath="chat.welcomeGreeting"
        tag="h1"
        class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl"
      >
        <template #name>
          <span class="welcome-gold-text">{{ userName }}</span>
        </template>
      </i18n-t>
      <p class="text-body-md text-neutral-500">{{ t('chat.welcomeSubtitle') }}</p>
    </div>

    <!-- The real composer, injected by the parent so it stays bound to the chat
         state and keeps its normal (left-aligned) field + toolbar. -->
    <div class="w-full">
      <slot />
    </div>

    <div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        v-for="s in suggestions"
        :key="s.key"
        type="button"
        class="group flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-left shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
        @click="emit('select', s.prompt)"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-neutral-200/70"
        >
          <UIcon :name="s.icon" class="size-[18px]" aria-hidden="true" />
        </span>
        <span class="min-w-0">
          <span class="block text-nav font-semibold text-neutral-900">{{ s.title }}</span>
          <span class="mt-0.5 block text-meta leading-snug text-neutral-500">{{ s.description }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes welcome-gold-sweep {
  0% { background-position: 200% 50%; }
  100% { background-position: 0% 50%; }
}

/* Gold name accent — same sweep used by the "Show me something cool" welcome
   chip in ChatWelcome.vue. */
.welcome-gold-text {
  background-image: linear-gradient(
    90deg,
    #92400e 0%,
    #b45309 18%,
    #d97706 32%,
    #ca8a04 44%,
    #fbbf24 50%,
    #fcd34d 56%,
    #fbbf24 62%,
    #d97706 76%,
    #b45309 88%,
    #92400e 100%
  );
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: welcome-gold-sweep 2.8s linear infinite;
}
</style>
