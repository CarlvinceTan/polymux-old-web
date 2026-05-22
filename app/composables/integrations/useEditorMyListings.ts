import type { ItemCategory } from '~/composables/integrations/useMarketplace'

/** Row from GET /api/marketplace/my-listings — editor index + detail pages. */
export interface EditorMyListing {
  id: string
  slug: string
  name: string
  description: string | null
  kind: ItemCategory
  visibility: 'private' | 'unlisted' | 'public'
  is_first_party: boolean
  is_verified: boolean
  install_count: number
  tags: string[]
  icon_url: string | null
  homepage_url: string | null
  source_repo_url: string | null
  current_version_id: string | null
  created_at: string
  updated_at: string
  current_version?: { id: string, version: string, status: string, published_at: string | null } | null
}

export function useEditorMyListings() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['editor-my-listings'],
    queryFn: () => $fetch<EditorMyListing[]>('/api/marketplace/my-listings'),
  })

  const listings = computed(() => query.data.value ?? [])
  const loading = computed(() => query.isFetching.value)
  const listPending = computed(() => query.isLoading.value && listings.value.length === 0)

  async function fetchListings(opts?: { force?: boolean }) {
    if (opts?.force) {
      await queryClient.invalidateQueries({ queryKey: ['editor-my-listings'] })
    } else {
      await queryClient.fetchQuery({ queryKey: ['editor-my-listings'] })
    }
  }

  function refreshListings() {
    return queryClient.invalidateQueries({ queryKey: ['editor-my-listings'] })
  }

  useOnReconnect(() => {
    void refreshListings()
  })

  return {
    listings,
    loading,
    listPending,
    fetchListings,
    refreshListings,
  }
}
