import { QueryClient, VueQueryPlugin, dehydrate, hydrate } from '@tanstack/vue-query'
import type { DehydratedState } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        // Keep cache entries resident for 30min after they go unused so
        // in-session navigation (and the warm-cache prefetch) keeps painting
        // last-known data instead of refetching from empty. Background SWR
        // still revalidates anything past staleTime.
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        // Recover freshness after the network/server comes back without a
        // manual reload.
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  })

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })

  if (import.meta.server) {
    nuxtApp.hooks.hook('app:rendered', () => {
      vueQueryState.value = dehydrate(queryClient)
    })
  }

  if (import.meta.client) {
    hydrate(queryClient, vueQueryState.value)
  }

  return {
    provide: {
      queryClient,
    },
  }
})
