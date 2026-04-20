/**
 * v-trim-ellipsis directive
 *
 * Works like CSS `text-overflow: ellipsis` but trims trailing whitespace
 * before the ellipsis character so you never get "word ..." — only "word…".
 *
 * Usage:
 *   <span v-trim-ellipsis="session.title" class="min-w-0 flex-1" />
 *
 * The directive binds to the element's width via ResizeObserver and
 * recalculates whenever the value or available width changes.
 */

let sharedCanvas: HTMLCanvasElement | null = null

function getCanvas(): CanvasRenderingContext2D {
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas')
  return sharedCanvas.getContext('2d')!
}

function getFont(el: HTMLElement): string {
  const s = window.getComputedStyle(el)
  return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
}

function measureWidth(text: string, font: string): number {
  const ctx = getCanvas()
  ctx.font = font
  return ctx.measureText(text).width
}

const ELLIPSIS = '\u2026' // …

function apply(el: HTMLElement, fullText: string) {
  // Store the original text so we can re-measure on resize
  el.dataset.trimFull = fullText

  const available = el.clientWidth
  if (available <= 0) return

  const font = getFont(el)

  if (measureWidth(fullText, font) <= available) {
    el.textContent = fullText
    el.removeAttribute('title')
    return
  }

  // Binary-search the longest prefix whose trimmed version + ELLIPSIS fits
  let lo = 0
  let hi = fullText.length

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const candidate = fullText.slice(0, mid).trimEnd() + ELLIPSIS
    if (measureWidth(candidate, font) <= available) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  el.textContent = fullText.slice(0, lo).trimEnd() + ELLIPSIS
  el.title = fullText
}

export default defineNuxtPlugin((nuxt) => {
  if (import.meta.server) {
    nuxt.vueApp.directive<HTMLElement, string>('trim-ellipsis', {
      getSSRProps(binding) {
        return { textContent: binding.value ?? '' }
      },
    })
    return
  }

  nuxt.vueApp.directive<HTMLElement, string>('trim-ellipsis', {
    mounted(el, binding) {
      apply(el, binding.value ?? '')
      const ro = new ResizeObserver(() => {
        apply(el, el.dataset.trimFull ?? binding.value ?? '')
      })
      ro.observe(el)
      ;(el as any)._trimEllipsisRO = ro
    },

    updated(el, binding) {
      apply(el, binding.value ?? '')
    },

    unmounted(el) {
      ;(el as any)._trimEllipsisRO?.disconnect()
    },
  })
})
