<script setup lang="ts">
import { useAppToast } from '~/composables/useAppToast'

const { toasts, dismiss } = useAppToast()

const iconMap: Record<string, string> = {
  warning: 'i-heroicons-exclamation-triangle-20-solid',
  error: 'i-heroicons-x-circle-20-solid',
  info: 'i-heroicons-information-circle-20-solid',
  loading: 'i-heroicons-arrow-path-20-solid',
}

const colorMap: Record<string, string> = {
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  loading: 'border-neutral-200 bg-white text-neutral-800',
}

const iconColorMap: Record<string, string> = {
  warning: 'text-amber-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  loading: 'text-neutral-500',
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-4">
        <TransitionGroup
          enter-active-class="transition-all duration-300 ease-out"
          leave-active-class="transition-all duration-200 ease-in"
          enter-from-class="translate-y-4 opacity-0"
          enter-to-class="translate-y-0 opacity-100"
          leave-from-class="translate-y-0 opacity-100"
          leave-to-class="translate-y-4 opacity-0"
        >
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg"
            :class="colorMap[toast.type]"
          >
            <UIcon
              :name="iconMap[toast.type]"
              class="mt-0.5 size-4 shrink-0"
              :class="[iconColorMap[toast.type], toast.type === 'loading' ? 'animate-spin' : '']"
              aria-hidden="true"
            />
            <p class="min-w-0 flex-1 text-sm leading-snug">{{ toast.message }}</p>
            <button
              type="button"
              class="mt-0.5 shrink-0 rounded opacity-60 transition-opacity hover:opacity-100"
              @click="dismiss(toast.id)"
            >
              <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </ClientOnly>
</template>
