import { ref } from 'vue'

export interface ToastAction {
  label: string
  // Variant maps to a button style in AppToastContainer. `primary` is the
  // affirmative path (Discard mine, Keep mine), `default` is the secondary
  // action, `danger` is destructive (rarely used inline in toasts).
  variant?: 'primary' | 'default' | 'danger'
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  type: 'warning' | 'error' | 'info' | 'loading'
  actions?: ToastAction[]
}

const toasts = ref<Toast[]>([])

let counter = 0

function show(
  message: string,
  type: Toast['type'] = 'warning',
  duration = 5000,
  actions?: ToastAction[],
): string {
  const id = `toast-${++counter}`
  toasts.value = [...toasts.value, { id, message, type, actions }]

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
  return id
}

function update(id: string, patch: Partial<Pick<Toast, 'message' | 'type' | 'actions'>>) {
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
