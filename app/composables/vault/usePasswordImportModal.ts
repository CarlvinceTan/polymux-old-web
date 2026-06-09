import { ref } from 'vue'

const isOpen = ref(false)

export function usePasswordImportModal() {
  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return {
    isOpen,
    open,
    close,
  }
}
