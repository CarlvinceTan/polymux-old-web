<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const handleSignIn = () => {
  router.push('/auth')
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col items-center justify-center self-stretch py-12 text-center">
    <div class="mb-4 rounded-full bg-neutral-100 p-4">
      <svg class="h-6 w-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <p class="mb-6 max-w-md text-neutral-500">
      This feature is not available for guest users. Sign in to your account to access this section.
    </p>
    <button
      @click="handleSignIn"
      class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
    >
      Sign In
    </button>
  </div>
</template>
