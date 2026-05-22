export interface LocalStorageProbe {
  supported: boolean
  persisted: boolean
  usage: number
  quota: number
  full: boolean
}

const FULL_RATIO = 0.95

function supportsOpfs(): boolean {
  return import.meta.client
    && typeof navigator !== 'undefined'
    && !!navigator.storage
    && typeof navigator.storage.getDirectory === 'function'
    && typeof indexedDB !== 'undefined'
}

export function useLocalFileStorage() {
  async function probe(): Promise<LocalStorageProbe> {
    if (!supportsOpfs()) {
      return { supported: false, persisted: false, usage: 0, quota: 0, full: false }
    }
    let persisted = false
    let usage = 0
    let quota = 0
    try {
      if (typeof navigator.storage.persisted === 'function') {
        persisted = await navigator.storage.persisted()
      }
    }
    catch {}
    try {
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate()
        usage = est.usage ?? 0
        quota = est.quota ?? 0
      }
    }
    catch {}
    const full = quota > 0 && usage / quota >= FULL_RATIO
    return { supported: true, persisted, usage, quota, full }
  }

  return { probe }
}
