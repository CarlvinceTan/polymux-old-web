import { ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'warning' | 'error' | 'info'
}

const toasts = ref<Toast[]>([])

let counter = 0

function show(message: string, type: Toast['type'] = 'warning', duration = 5000) {
  const id = `toast-${++counter}`
  toasts.value = [...toasts.value, { id, message, type }]

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
}

function dismiss(id: string) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

export function useAppToast() {
  return { toasts, show, dismiss }
}
