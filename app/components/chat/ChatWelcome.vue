<script setup lang="ts">
const { t } = useI18n()

defineProps<{
  userName: string
  welcomeSuggestion: string
}>()

const emit = defineEmits<{
  suggestion: []
}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-8">
    <div class="flex max-w-lg flex-col items-center gap-6">
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
        {{ t('chat.welcomeGreeting', { name: userName }) }}
      </h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-linear-to-b from-amber-50/90 to-amber-100/40 px-4 py-3 text-meta leading-snug shadow-sm transition-all hover:border-amber-300 hover:from-amber-50 hover:to-amber-100/60 sm:text-xs"
        @click="emit('suggestion')"
      >
        <UIcon
          name="i-heroicons-sparkles-20-solid"
          class="welcome-sparkle size-[1.15em] shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <span class="welcome-gold-text font-medium">{{ welcomeSuggestion }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes welcome-gold-sweep {
  0% { background-position: 200% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes welcome-sparkle-pulse {
  0%, 100% { opacity: 1; filter: brightness(1); }
  50% { opacity: 0.85; filter: brightness(1.25); }
}

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

.welcome-sparkle {
  animation: welcome-sparkle-pulse 2.8s ease-in-out infinite;
}
</style>
