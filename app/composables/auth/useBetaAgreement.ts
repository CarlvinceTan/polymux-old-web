const STORAGE_KEY = 'polymux:betaAgreementAccepted:v1'

const accepted = ref(false)
const ready = ref(false)

export function useBetaAgreement() {
  function load() {
    if (!import.meta.client) return
    try {
      accepted.value = localStorage.getItem(STORAGE_KEY) === 'true'
    }
    catch {
      accepted.value = false
    }
    ready.value = true
  }

  function accept() {
    accepted.value = true
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      }
      catch {
        // localStorage unavailable — keep the in-memory flag so the modal
        // doesn't reopen during this session.
      }
    }
  }

  if (import.meta.client && !ready.value) load()

  return {
    accepted: readonly(accepted),
    ready: readonly(ready),
    accept,
  }
}
