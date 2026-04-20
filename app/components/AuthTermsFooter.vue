<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <p
    class="shrink-0 bg-neutral-50 px-4 text-center text-[0.75rem] leading-relaxed text-neutral-500 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:text-[0.8125rem] sm:pb-[max(1.75rem,env(safe-area-inset-bottom))]"
  >
    <span class="mx-auto block max-w-lg">
      {{ t('auth.agreeToTerms') }}
      <NuxtLink
        to="/terms-of-service"
        class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
      >
        {{ t('auth.termsOfService') }}
      </NuxtLink>
      {{ t('auth.and') }}
      <NuxtLink
        to="/privacy-policy"
        class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
      >
        {{ t('auth.privacyPolicy') }}
      </NuxtLink>{{ t('auth.andReceiveEmails') }}
    </span>
  </p>
</template>
