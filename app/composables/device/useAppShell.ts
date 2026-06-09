import type { PolymuxNativeBridge } from '~/types/polymux-native'

function readBridge(): PolymuxNativeBridge | undefined {
  if (!import.meta.client) return undefined
  return window.__POLYMUX__
}

export function useAppShell() {
  const bridge = computed(() => readBridge())

  const isNativeShell = computed(() => bridge.value?.shell === 'native')

  const isElectron = computed(() => {
    if (!import.meta.client) return false
    return navigator.userAgent.toLowerCase().includes('electron')
  })

  /** True when the Polymux native shell exposes a vault import bridge. */
  const canAutoImport = computed(() => {
    return isNativeShell.value && !!bridge.value?.vault
  })

  /** Regular browser tab (or Electron without the native bridge). */
  const isWebBrowser = computed(() => import.meta.client && !canAutoImport.value)

  return {
    bridge,
    isNativeShell,
    isElectron,
    canAutoImport,
    isWebBrowser,
  }
}
