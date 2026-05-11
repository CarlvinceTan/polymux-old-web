import { ref, readonly, onMounted, onUnmounted } from 'vue'

export type GeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface GeolocationCoords {
  latitude: number
  longitude: number
  accuracy: number
}

export interface UseGeolocationOptions {
  // Pass `false` from passive consumers (e.g. SettingsModal) that only render
  // permission/toggle UI. The native `watchPosition` only runs while at least
  // one active consumer is mounted, so unrelated pages don't trigger
  // CoreLocation requests just because the global SidePanel mounted them.
  active?: boolean
}

const coords = ref<GeolocationCoords | null>(null)
const permissionState = ref<GeolocationPermissionState>('prompt')
const error = ref<string | null>(null)
const enabled = ref(false)

let watchId: number | null = null
let permissionStatus: PermissionStatus | null = null
let consumers = 0
let activeConsumers = 0
let initialized = false

function readCookie(): boolean {
  if (!import.meta.client) return false
  const cookie = useCookie<string | undefined>('polymux_location')
  return cookie.value === 'on'
}

function writeCookie(value: boolean) {
  const cookie = useCookie<string>('polymux_location')
  cookie.value = value ? 'on' : 'off'
}

async function queryPermission() {
  if (!import.meta.client) return
  if (!navigator.geolocation) {
    permissionState.value = 'unsupported'
    return
  }
  try {
    permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
    permissionState.value = permissionStatus.state as GeolocationPermissionState
    permissionStatus.onchange = () => {
      if (permissionStatus) {
        permissionState.value = permissionStatus.state as GeolocationPermissionState
        if (permissionStatus.state === 'denied') {
          stopWatching()
        }
      }
    }
  }
  catch {
    permissionState.value = 'prompt'
  }
}

function requestLocation(): Promise<GeolocationCoords | null> {
  return new Promise((resolve) => {
    if (!import.meta.client || !navigator.geolocation) {
      error.value = 'Geolocation not supported'
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: GeolocationCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }
        coords.value = c
        error.value = null
        resolve(c)
      },
      (err) => {
        if (err.code !== err.POSITION_UNAVAILABLE) {
          error.value = err.message
        }
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  })
}

function startWatching() {
  if (!import.meta.client || !navigator.geolocation || watchId !== null) return
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      coords.value = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
      error.value = null
    },
    (err) => {
      if (err.code === err.POSITION_UNAVAILABLE) return
      error.value = err.message
    },
    { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
  )
}

function stopWatching() {
  if (watchId !== null && import.meta.client) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
}

async function enable() {
  enabled.value = true
  writeCookie(true)
  const result = await requestLocation()
  if (result && activeConsumers > 0) {
    startWatching()
  }
  await queryPermission()
}

function disable() {
  enabled.value = false
  writeCookie(false)
  stopWatching()
  coords.value = null
}

function toggle() {
  if (enabled.value) {
    disable()
  }
  else {
    enable()
  }
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const wantsActive = options.active !== false

  onMounted(async () => {
    consumers++
    if (!initialized) {
      initialized = true
      await queryPermission()
      if (readCookie()) enabled.value = true
    }
    if (wantsActive) {
      activeConsumers++
      if (
        activeConsumers === 1
        && watchId === null
        && readCookie()
        && permissionState.value === 'granted'
      ) {
        await requestLocation()
        startWatching()
      }
    }
  })

  onUnmounted(() => {
    consumers = Math.max(0, consumers - 1)
    if (wantsActive) {
      activeConsumers = Math.max(0, activeConsumers - 1)
      if (activeConsumers === 0) {
        stopWatching()
      }
    }
    if (consumers === 0) {
      if (permissionStatus) {
        permissionStatus.onchange = null
        permissionStatus = null
      }
      initialized = false
    }
  })

  return {
    coords: readonly(coords),
    permissionState: readonly(permissionState),
    error: readonly(error),
    enabled: readonly(enabled),
    enable,
    disable,
    toggle,
    requestLocation,
    startWatching,
    stopWatching,
  }
}
