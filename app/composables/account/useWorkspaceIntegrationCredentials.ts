// Per-workspace BYO credential overrides — the data layer for the "use your own
// OAuth client" UI. Mirrors useEditorMyListings' vue-query shape. Secrets are
// never returned; the server hands back a hint (e.g. last 4) per field.

export interface WorkspaceIntegrationCredential {
  id: string
  integration_id: string
  integration_slug: string | null
  integration_name: string | null
  credential_key: string
  credential_type: string
  hint: Record<string, string> | null
  updated_at: string
}

export interface SaveCredentialInput {
  integration_id: string
  credential_key: string
  credential_type: string
  fields: Record<string, string>
}

export function useWorkspaceIntegrationCredentials(workspaceId: MaybeRefOrGetter<string>) {
  const queryClient = useQueryClient()
  const wsId = computed(() => toValue(workspaceId))
  const queryKey = computed(() => ['workspace-integration-credentials', wsId.value])

  const query = useQuery({
    queryKey,
    enabled: computed(() => !!wsId.value),
    queryFn: () => $fetch<WorkspaceIntegrationCredential[]>(`/api/workspaces/${wsId.value}/integration-credentials`),
  })

  const credentials = computed(() => query.data.value ?? [])
  const loading = computed(() => query.isLoading.value)

  /** Returns the override for a given (integration, credential_key), if any. */
  function overrideFor(integrationId: string, credentialKey: string): WorkspaceIntegrationCredential | undefined {
    return credentials.value.find(c => c.integration_id === integrationId && c.credential_key === credentialKey)
  }

  async function saveCredential(input: SaveCredentialInput) {
    await $fetch(`/api/workspaces/${wsId.value}/integration-credentials`, { method: 'POST', body: input })
    await queryClient.invalidateQueries({ queryKey: queryKey.value })
  }

  async function removeCredential(integrationId: string, credentialKey: string) {
    await $fetch(`/api/workspaces/${wsId.value}/integration-credentials`, {
      method: 'DELETE',
      query: { integration_id: integrationId, credential_key: credentialKey },
    })
    await queryClient.invalidateQueries({ queryKey: queryKey.value })
  }

  return { credentials, loading, overrideFor, saveCredential, removeCredential, refresh: () => queryClient.invalidateQueries({ queryKey: queryKey.value }) }
}
