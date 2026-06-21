import { prefetchPasswords } from '~/composables/vault/usePasswords'
import { prefetchSignIns } from '~/composables/vault/useSignIns'

/**
 * Warms the Vue Query cache for workspace-scoped surfaces during the
 * workspace-entry "loading circle", so navigating to Vault / Wallet / Storage /
 * Integrations paints last-known data instantly instead of flashing empty.
 *
 * Usage: call `usePrefetchWorkspaceCache()` once at component setup (it captures
 * its dependencies then), and invoke the returned `prefetchWorkspaceCache(wsId)`
 * later — after bootstrap finishes or when the workspace switches. It is
 * fire-and-forget: it never blocks the UI and never throws (Promise.allSettled).
 *
 * Drift safety: passwords/sign-ins go through the composables' own exported
 * fetchers so the cache holds the correctly mapped shape. Wallet and
 * integration-credentials have no client-side mapping, so their key + fetcher
 * are inlined here and MUST stay in sync with useWallet / the credentials
 * composable. Storage uses useStorageFiles' own prefetch (key-safe).
 */
export function usePrefetchWorkspaceCache() {
  const supabase = useSupabaseClient()
  const { authFetch } = useAuthFetch()
  const queryClient = useQueryClient()
  const { isWalletEnabled } = useMeFeatures()
  const { fetchMembers } = useWorkspaces()
  const { prefetchDirectory } = useStorageFiles()

  async function prefetchWorkspaceCache(workspaceId: string | null | undefined) {
    if (!import.meta.client || !workspaceId) return

    const tasks: Array<Promise<unknown>> = [
      // Vault — mapped through the composables' shared fetchers.
      prefetchPasswords(queryClient, supabase, workspaceId),
      prefetchSignIns(queryClient, supabase, workspaceId),
      // Integrations — raw $fetch shape, key mirrors useWorkspaceIntegrationCredentials.
      queryClient.prefetchQuery({
        queryKey: ['workspace-integration-credentials', workspaceId],
        // Explicit generic avoids Nuxt's typed-route deep inference on the
        // template-literal path (excessive-stack-depth).
        queryFn: () => $fetch<unknown>(`/api/workspaces/${workspaceId}/integration-credentials`),
      }),
      // Members — already SWR-aware (seeds display count, updates only on change).
      fetchMembers(workspaceId),
      // Storage root — so /storage/files (and deeplinks) paint immediately.
      prefetchDirectory([]),
    ]

    // Wallet is gated behind a feature flag; skip the request when it's off.
    if (isWalletEnabled()) {
      tasks.push(queryClient.prefetchQuery({
        queryKey: ['wallet', workspaceId],
        // Let failures throw so prefetchQuery records an error (not a cached
        // `null`) — a transient bootstrap failure must not poison the cache
        // with a fake "$0.00" and suppress the live query's refetch.
        // Promise.allSettled below swallows the rejection.
        queryFn: () => authFetch(`/workspaces/${workspaceId}/wallet`),
      }))
    }

    await Promise.allSettled(tasks)
  }

  return { prefetchWorkspaceCache }
}
