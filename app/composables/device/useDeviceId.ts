const DEVICE_ID_KEY = 'polymux_device_id'

// Persistent per-browser identifier. Generated on first call and kept in
// localStorage. Used by the "local" storage backend to tell which device
// holds a given file — if the requesting browser's id doesn't match the
// `backend_ref` device id, the file isn't locally available.
//
// Server-side call returns an empty string, which callers should treat as
// "no device id available." Nothing on the server should need this — it's
// inherently a client concept.
export function useDeviceId(): string {
  if (import.meta.server) return ''
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : fallbackUuid()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function fallbackUuid(): string {
  // Good-enough fallback for ancient runtimes where crypto.randomUUID is
  // missing. Collision risk is negligible at our scale — this is an
  // in-browser identifier, not a security token.
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 32; i++) {
    out += hex[Math.floor(Math.random() * 16)]
    if (i === 7 || i === 11 || i === 15 || i === 19) out += '-'
  }
  return out
}
