import type { WorkflowStep } from '~/composables/workflows/useWorkflows'

export interface SimilarityGroup {
  key: string
  action: string | null
  target: string | null
  children: WorkflowStep[]
  childIds: (string | undefined)[]
}

export function groupChildrenBySimilarity(
  children: WorkflowStep[],
): SimilarityGroup[] {
  if (children.length === 0) return []

  const bucketMap = new Map<string, WorkflowStep[]>()

  for (const child of children) {
    const action = child.action?.trim() || null
    const target = child.target?.trim() || null

    // Children with no action AND no target each get their own group
    if (!action && !target) {
      const singletonKey = `__single_${bucketMap.size}__`
      bucketMap.set(singletonKey, [child])
      continue
    }

    const key = `${action ?? '__none__'}|${target ?? '__none__'}`
    const list = bucketMap.get(key) ?? []
    list.push(child)
    bucketMap.set(key, list)
  }

  const groups: SimilarityGroup[] = []
  for (const [key, grouped] of bucketMap) {
    const first = grouped[0]!
    groups.push({
      key,
      action: first.action?.trim() || null,
      target: first.target?.trim() || null,
      children: grouped,
      childIds: grouped.map(c => c.id),
    })
  }

  return groups
}
