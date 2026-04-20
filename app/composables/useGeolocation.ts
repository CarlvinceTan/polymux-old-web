import { ref, readonly, onMounted, onUnmounted } from 'vue'

export type GeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface GeolocationCoords {
  latitude: number
  longitude: number
  accuracy: number
}

export function useGeolocation() {
  const coords = ref<GeolocationCoords | null>(null)
  const permissionState = ref<GeolocationPermissionState>('prompt')
  const error = ref<string | null>(null)
  const enabled = ref(false)

  let watchId: number | null = null
  let permissionStatus: PermissionStatus | null = null

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
      // Permissions API not available; fall back to 'prompt'
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
          error.value = err.message
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
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
        error.value = err.message
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
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
    if (result) {
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

  onMounted(async () => {
    await queryPermission()
    if (readCookie() && permissionState.value === 'granted') {
      enabled.value = true
      await requestLocation()
      startWatching()
    }
    else if (readCookie()) {
      enabled.value = true
    }
  })

  onUnmounted(() => {
    stopWatching()
    if (permissionStatus) {
      permissionStatus.onchange = null
      permissionStatus = null
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
