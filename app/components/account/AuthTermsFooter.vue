<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <p class="mx-auto mt-4 max-w-sm text-center text-[0.7rem] leading-relaxed text-neutral-500 sm:mt-5 sm:text-[0.75rem]">
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
  </p>
</template>
