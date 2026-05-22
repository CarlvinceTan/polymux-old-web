import type { MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue, watch } from 'vue'

/**
 * Client-side windowing for long lists: show the first `pageSize` items, then
 * `loadMore()` (e.g. from an intersection sentinel) appends another page.
 */
export function useInfiniteList<T>(source: MaybeRefOrGetter<T[]>, pageSize: number) {
  const visibleCount = ref(pageSize)

  watch(
    () => toValue(source),
    () => {
      visibleCount.value = pageSize
    },
    { deep: true },
  )

  const fullList = computed(() => toValue(source))

  const visibleItems = computed(() => fullList.value.slice(0, visibleCount.value))

  const hasMore = computed(() => visibleCount.value < fullList.value.length)

  function loadMore() {
    const len = fullList.value.length
    if (visibleCount.value >= len) return
    visibleCount.value = Math.min(visibleCount.value + pageSize, len)
  }

  return { visibleItems, hasMore, loadMore, visibleCount }
}
