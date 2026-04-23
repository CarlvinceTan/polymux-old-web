import { ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'warning' | 'error' | 'info' | 'loading'
}

const toasts = ref<Toast[]>([])

let counter = 0

function show(message: string, type: Toast['type'] = 'warning', duration = 5000): string {
  const id = `toast-${++counter}`
  toasts.value = [...toasts.value, { id, message, type }]

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
  return id
}

function update(id: string, patch: Partial<Pick<Toast, 'message' | 'type'>>) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx < 0) return
  const next = [...toasts.value]
  next[idx] = { ...next[idx]!, ...patch }
  toasts.value = next
}

function dismiss(id: string) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

export function useAppToast() {
  return { toasts, show, update, dismiss }
}
