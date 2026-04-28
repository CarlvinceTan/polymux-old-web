/**
 * useExtensionPrefs — local-first preferences for the Polymux browser
 * extension, plus the Install-Extension action used by both the
 * first-time banner (PageHeader) and the "Install Extension" entry in
 * the profile menu (SidePanel).
 *
 * Both prefs are per-device, so we persist in localStorage rather than
 * user_settings — no server round-trip, no migration, and a user who
 * reinstalls the extension on a fresh machine doesn't inherit the
 * "dismissed" state from their previous device.
 *
 * The Chrome Web Store URL is a placeholder until the extension is
 * published; configurable via runtime config for deployments that want
 * to point at a private store or corporate mirror.
 */

const BANNER_KEY = 'polymux.extension.banner_dismissed'
const ENABLED_KEY = 'polymux.extension.enabled'

// Fallback URLs. The extension listing URL is a placeholder — once the
// extension is published to the Chrome Web Store, update
// `runtimeConfig.public.extensionStoreUrl` in nuxt.config.ts.
const DEFAULT_EXTENSION_STORE_URL = 'https://chrome.google.com/webstore/category/extensions'
const CHROME_DOWNLOAD_URL = 'https://www.google.com/chrome/'

type Browser = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other'

function isClient(): boolean {
  return typeof window !== 'undefined'
}

function readBool(key: string, fallback: boolean): boolean {
  if (!isClient()) return fallback
  try {
    const v = window.localStorage.getItem(key)
    if (v === null) return fallback
    return v === 'true'
  }
  catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean): void {
  if (!isClient()) return
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false')
  }
  catch {
    /* ignore quota / private-mode errors */
  }
}

// Module-level singletons so every call site sees the same reactive state.
const bannerDismissedState = ref<boolean | null>(null)
const extensionEnabledState = ref<boolean | null>(null)

function ensureHydrated(): void {
  if (!isClient()) return
  if (bannerDismissedState.value === null) {
    bannerDismissedState.value = readBool(BANNER_KEY, false)
  }
  if (extensionEnabledState.value === null) {
    extensionEnabledState.value = readBool(ENABLED_KEY, false)
  }
}

function detectBrowser(): Browser {
  if (!isClient()) return 'other'
  const ua = navigator.userAgent
  // Edge contains "Chrome" in its UA, so test it first.
  if (/Edg\//i.test(ua)) return 'edge'
  if (/Chrome|Chromium|CriOS/i.test(ua)) return 'chrome'
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox'
  if (/Safari/i.test(ua) && !/Chrome|Chromium/i.test(ua)) return 'safari'
  return 'other'
}

export function useExtensionPrefs() {
  ensureHydrated()

  const config = isClient() ? useRuntimeConfig() : undefined
  const extensionStoreUrl
    = (config?.public?.extensionStoreUrl as string | undefined)
      || DEFAULT_EXTENSION_STORE_URL

  const bannerDismissed = computed<boolean>(() => bannerDismissedState.value ?? false)

  const extensionEnabled = computed<boolean>({
    get: () => extensionEnabledState.value ?? false,
    set: (v: boolean) => {
      extensionEnabledState.value = v
      writeBool(ENABLED_KEY, v)
    },
  })

  function dismissBanner(): void {
    bannerDismissedState.value = true
    writeBool(BANNER_KEY, true)
  }

  /**
   * Trigger the install flow. Chrome-family browsers open the Web Store
   * listing; other browsers get a confirmation prompt to install Chrome
   * first (MV3 extensions don't run outside the Chromium engine).
   */
  function openInstallExtension(opts?: { chromeRequiredMessage?: string }): void {
    if (!isClient()) return
    const browser = detectBrowser()
    if (browser === 'chrome' || browser === 'edge') {
      window.open(extensionStoreUrl, '_blank', 'noopener,noreferrer')
      return
    }
    const message = opts?.chromeRequiredMessage
      ?? 'The Polymux extension requires Chrome. Install Chrome?'
    const confirmed = window.confirm(message)
    if (confirmed) {
      window.open(CHROME_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')
    }
  }

  return {
    bannerDismissed,
    extensionEnabled,
    dismissBanner,
    openInstallExtension,
    detectBrowser,
  }
}
