import { nextTick, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * Sizes a `rows="1"` textarea to fit its content up to `maxLines`.
 * - `expanded` becomes true once content wraps past the first line; callers
 *   use it to switch the surrounding chrome (e.g. send-button alignment).
 * - Initial size is set on mount and whenever `content` changes.
 * - `resize()` is exposed for callers whose textarea is conditionally
 *   rendered (e.g. edit mode); they should call it after the element mounts.
 */
export function useAutoResizeTextarea(
  textareaRef: Ref<HTMLTextAreaElement | null>,
  content: Ref<string>,
  options: { maxLines?: number } = {},
) {
  const maxLines = options.maxLines ?? 4
  const expanded = ref(false)

  function resize() {
    const el = textareaRef.value
    if (!el) return
    const lh = Number.parseFloat(getComputedStyle(el).lineHeight)
    const linePx = Number.isFinite(lh) ? lh : 20
    const maxPx = linePx * maxLines

    const isBlank = !String(content.value ?? '').trim()
    el.style.height = '0px'

    if (isBlank) {
      expanded.value = false
      el.style.height = `${linePx}px`
      return
    }

    const raw = el.scrollHeight
    expanded.value = raw > linePx + 2
    const next = Math.min(Math.max(raw, linePx), maxPx)
    el.style.height = `${next}px`
  }

  watch(content, async () => {
    await nextTick()
    resize()
  })

  onMounted(async () => {
    await nextTick()
    resize()
  })

  return { resize, expanded }
}
