import { ref } from 'vue'

const inputTokenCap = ref<number | null>(null)
let configFetched = false
let inflight: Promise<void> | null = null

async function fetchAgentConfig() {
  if (configFetched) return
  if (inflight) return inflight

  const config = useRuntimeConfig()
  const supabase = useSupabaseClient()

  inflight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const baseURL = (config.public.serverUrl as string).replace(/\/$/, '')
      const res = await fetch(`${baseURL}/agent-config`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.input_token_cap === 'number') {
          inputTokenCap.value = data.input_token_cap
        }
      }
      configFetched = true
    }
    catch {
      // Silently fall back to no client-side cap; server-side AutoCompact still applies.
    }
    finally {
      inflight = null
    }
  })()
  return inflight
}

export function useAgentConfig() {
  fetchAgentConfig()
  return {
    inputTokenCap,
  }
}
