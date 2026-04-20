export function useAuthFetch() {
  const supabase = useSupabaseClient()
  const config = useRuntimeConfig()
  const baseURL = config.public.serverUrl as string

  async function authFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const { headers: optsHeaders, ...rest } = opts
    return $fetch<T>(path, {
      baseURL,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(optsHeaders as Record<string, string> | undefined),
      },
      ...rest,
    })
  }

  return { authFetch }
}
