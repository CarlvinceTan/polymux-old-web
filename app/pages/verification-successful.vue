<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `${t('auth.verificationSuccessful')}`,
})
</script>

<template>
  <div class="flex h-dvh flex-col bg-neutral-50">
    <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:py-6 md:py-10">
      <div class="w-full max-w-md">
        <div
          class="rounded-2xl border border-neutral-200/90 bg-white px-5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:px-6 sm:py-8"
        >
          <div class="mb-4 flex w-full justify-center">
            <NuxtLink
              to="/"
              class="inline-flex rounded-md text-neutral-950 outline-none ring-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2"
              :aria-label="t('auth.polymuxHome')"
            >
              <PolymuxLogo class="size-12 shrink-0 sm:size-14" />
            </NuxtLink>
          </div>

          <div class="flex flex-col items-center gap-4">
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Icon name="heroicons:check-20-solid" class="h-8 w-8 text-green-600" />
            </div>
            <h1 class="text-center text-[1.25rem] font-semibold tracking-tight text-neutral-950 sm:text-[1.375rem]">
              {{ t('auth.verificationSuccessful') }}
            </h1>
            <p class="text-center text-[0.8125rem] text-neutral-500 sm:text-sm">
              {{ t('auth.verificationSuccessfulDesc') }}
            </p>
            <div class="mt-2 w-full">
              <NuxtLink
                to="/sign-in"
                class="flex h-10 w-full items-center justify-center rounded-md bg-neutral-950 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {{ t('auth.returnToSignIn') }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>
    <AuthTermsFooter />
  </div>
</template>
