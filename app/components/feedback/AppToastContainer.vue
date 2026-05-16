<script setup lang="ts">
import type { ToastAction } from '~/composables/ui/useAppToast'
import { useAppToast } from '~/composables/ui/useAppToast'

const { t } = useI18n()
const { toasts, dismiss } = useAppToast()

function actionClass(variant: ToastAction['variant'] = 'default'): string {
  switch (variant) {
    case 'primary':
      return 'bg-neutral-900 text-white hover:bg-neutral-800'
    case 'danger':
      return 'bg-red-600 text-white hover:bg-red-500'
    default:
      return 'bg-white/80 text-neutral-800 ring-1 ring-neutral-300 hover:bg-white'
  }
}

function runAction(toastId: string, action: ToastAction) {
  try {
    action.onClick()
  }
  finally {
    dismiss(toastId)
  }
}

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
      <div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
        <TransitionGroup
          tag="div"
          class="flex flex-col items-center gap-2"
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
            class="pointer-events-auto inline-flex max-w-[min(36rem,calc(100vw-2rem))] items-center gap-2.5 rounded-xl border p-3.5 shadow-lg"
            :class="colorMap[toast.type]"
          >
            <UIcon
              :name="iconMap[toast.type]"
              class="size-4 shrink-0"
              :class="[iconColorMap[toast.type], toast.type === 'loading' ? 'animate-spin' : '']"
              aria-hidden="true"
            />
            <p
              class="m-0 min-w-0 shrink truncate text-sm leading-snug"
              :title="toast.message"
            >
              {{ toast.message }}
            </p>
            <!--
              Action buttons. Each click runs the action's callback AND
              dismisses the toast — saves the caller from having to dismiss
              by id in every onClick, and matches the "pick one then move
              on" pattern (Discard / Keep).
            -->
            <template v-if="toast.actions && toast.actions.length > 0">
              <button
                v-for="action in toast.actions"
                :key="action.label"
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/45"
                :class="actionClass(action.variant)"
                @click.stop="runAction(toast.id, action)"
              >
                {{ action.label }}
              </button>
            </template>
            <UIcon
              name="i-heroicons-x-mark-20-solid"
              role="button"
              tabindex="0"
              class="size-4 shrink-0 cursor-pointer opacity-60 transition-opacity hover:opacity-100 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/45"
              :aria-label="t('common.dismiss')"
              @click.stop="dismiss(toast.id)"
              @keydown.enter.prevent="dismiss(toast.id)"
              @keydown.space.prevent="dismiss(toast.id)"
            />
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </ClientOnly>
</template>
