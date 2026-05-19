import type { WorkflowWithLatest } from '~/composables/workflows/useWorkflows'

// useEmbeddedWorkflowCache resolves workflow_ref UUIDs to their owning
// WorkflowWithLatest records (name + latest version graph) so embed
// nodes and the embed info panel can render the referenced workflow's
// content. Designed for the iteration-heavy canvas — call once in
// setup, then `lookup(id)` synchronously in the template; misses
// trigger background fetches and reactively backfill.
//
// The cache lives at session scope (`useState`) so a workflow referenced
// by many embeds in many workflows is fetched exactly once across the
// page. A `null` entry encodes "fetched but not found / unauthorised"
// so we don't keep retrying on every render of an embed that points at
// a deleted or inaccessible workflow.

type CacheEntry = WorkflowWithLatest | null

export interface UseEmbeddedWorkflowCache {
  // lookup returns the resolved workflow for workflowId, or null if it
  // is still loading or doesn't exist. Triggers a background fetch on
  // miss. Safe to call in templates — reactive on the underlying cache.
  lookup: (workflowId: string | undefined | null) => WorkflowWithLatest | null
  // request explicitly kicks off a fetch for one or more workflow ids
  // without waiting for the lookup-on-render trigger. Useful for
  // pre-warming the cache when a graph mounts.
  request: (workflowIds: string[]) => void
}

export function useEmbeddedWorkflowCache(): UseEmbeddedWorkflowCache {
  const cache = useState<Map<string, CacheEntry>>('embedded-workflows', () => new Map())
  const inflight = useState<Map<string, Promise<CacheEntry>>>('embedded-workflows-inflight', () => new Map())
  const { currentWorkspace } = useWorkspaces()
  const { getWorkflow } = useWorkflows()

  function startFetch(id: string): void {
    if (cache.value.has(id) || inflight.value.has(id)) return
    const workspaceId = currentWorkspace.value?.id
    if (!workspaceId) {
      cache.value.set(id, null)
      return
    }
    const promise = (async (): Promise<CacheEntry> => {
      const result = await getWorkflow(workspaceId, id)
      const entry: CacheEntry = result ?? null
      // Touch the Map so consumers using it via useState are notified.
      const next = new Map(cache.value)
      next.set(id, entry)
      cache.value = next
      const nextInflight = new Map(inflight.value)
      nextInflight.delete(id)
      inflight.value = nextInflight
      return entry
    })()
    const nextInflight = new Map(inflight.value)
    nextInflight.set(id, promise)
    inflight.value = nextInflight
  }

  return {
    lookup(workflowId) {
      const id = typeof workflowId === 'string' ? workflowId.trim() : ''
      if (!id) return null
      if (!cache.value.has(id)) {
        startFetch(id)
        return null
      }
      return cache.value.get(id) ?? null
    },
    request(workflowIds) {
      for (const id of workflowIds) {
        if (typeof id !== 'string' || !id.trim()) continue
        startFetch(id.trim())
      }
    },
  }
}
