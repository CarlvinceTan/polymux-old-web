export function useGuestAuth() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const isAnonymous = computed(() => user.value?.is_anonymous === true)

  async function ensureAuth(): Promise<void> {
    if (user.value) return
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    const { fetchWorkspaces } = useWorkspaces()
    await fetchWorkspaces()
  }

  return { isAnonymous, ensureAuth }
}
