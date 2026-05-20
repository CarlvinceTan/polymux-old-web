<script setup lang="ts">
import type { Toast, ToastAction } from '~/composables/ui/useAppToast'
import { useAppToast } from '~/composables/ui/useAppToast'

const { t } = useI18n()
const { toasts, dismiss } = useAppToast()

// Per-toast-type button palette so action buttons inherit the toast's hue
// instead of defaulting to neutral black/white.
//   primary = affirmative path (Keep / Save / Discard mine)
//   default = secondary path (cancel-like)
//   danger  = destructive — stays red regardless of toast hue
type ActionPalette = Record<NonNullable<ToastAction['variant']>, string>

const actionPaletteMap: Record<Toast['type'], ActionPalette> = {
  warning: {
    primary: 'bg-amber-600 text-white hover:bg-amber-500 focus-visible:ring-amber-500/50',
    default: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200 focus-visible:ring-amber-500/50',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/50',
  },
  error: {
    primary: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/50',
    default: 'bg-red-100 text-red-900 ring-1 ring-red-300 hover:bg-red-200 focus-visible:ring-red-500/50',
    danger: 'bg-red-700 text-white hover:bg-red-600 focus-visible:ring-red-500/50',
  },
  info: {
    primary: 'bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-500/50',
    default: 'bg-blue-100 text-blue-900 ring-1 ring-blue-300 hover:bg-blue-200 focus-visible:ring-blue-500/50',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/50',
  },
  loading: {
    primary: 'bg-neutral-700 text-white hover:bg-neutral-600 focus-visible:ring-neutral-500/50',
    default: 'bg-neutral-100 text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-200 focus-visible:ring-neutral-500/50',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/50',
  },
}

function actionClass(type: Toast['type'], variant: ToastAction['variant'] = 'default'): string {
  return actionPaletteMap[type][variant]
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
            class="pointer-events-auto flex w-[min(28rem,calc(100vw-2rem))] max-w-full flex-col rounded-xl border p-3.5 shadow-lg"
            :class="colorMap[toast.type]"
          >
            <div class="flex items-start">
              <UIcon
                :name="iconMap[toast.type]"
                class="mt-0.5 size-4 shrink-0"
                :class="[iconColorMap[toast.type], toast.type === 'loading' ? 'animate-spin' : '']"
                aria-hidden="true"
              />
              <!--
                Middle column carries the header label and message. mr-3.5
                (14px) on this column mirrors the toast's p-3.5 right padding
                so the close-X has equal space on both sides —
                toast-edge ↔ X == X ↔ text-right.
              -->
              <div class="ml-2.5 mr-3.5 min-w-0 flex-1">
                <div class="text-sm font-semibold leading-snug">
                  {{ t(`common.toast.${toast.type}`) }}
                </div>
                <p class="mt-1 whitespace-pre-line break-words text-sm leading-snug">
                  {{ toast.message }}
                </p>
              </div>
              <UIcon
                name="i-heroicons-x-mark-20-solid"
                role="button"
                tabindex="0"
                class="mt-0.5 size-4 shrink-0 cursor-pointer opacity-60 transition-opacity hover:opacity-100 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/45"
                :aria-label="t('common.dismiss')"
                @click.stop="dismiss(toast.id)"
                @keydown.enter.prevent="dismiss(toast.id)"
                @keydown.space.prevent="dismiss(toast.id)"
              />
            </div>
            <!--
              Actions row sits below the header row and spans the full toast
              width so justify-center positions the buttons in the visual
              centre of the toast (not just the content column). mt-4 / mb-1
              add breathing room above and below the buttons; clicking any
              action runs its callback then dismisses the toast.
            -->
            <div
              v-if="toast.actions && toast.actions.length > 0"
              class="mt-3 mb-0.5 flex flex-wrap justify-center gap-2"
            >
              <button
                v-for="action in toast.actions"
                :key="action.label"
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
                :class="actionClass(toast.type, action.variant)"
                @click.stop="runAction(toast.id, action)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </ClientOnly>
</template>
