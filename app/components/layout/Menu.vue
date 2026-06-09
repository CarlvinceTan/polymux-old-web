<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    /** `below`: under trigger (e.g. workspace). `above`: above trigger (e.g. sidebar footer). */
    placement?: 'below' | 'above'
    /** `left`: anchored to left edge (default). `right`: anchored to right edge. `center`: centred horizontally over the trigger. */
    align?: 'left' | 'right' | 'center'
    /** Override the default `w-full` with a fixed width class e.g. `"w-40"`. */
    width?: string
    /** Lighter chrome (smaller radius, softer shadow) for small floating panels. */
    compact?: boolean
  }>(),
  { placement: 'below', align: 'left', compact: false },
)

const dropdownRef = ref<HTMLElement | null>(null)
const autoPlacement = ref<'below' | 'above' | null>(null)
const measured = ref(false)
const posStyle = ref<Record<string, string>>({})
const anchorRef = ref<HTMLElement | null>(null)

let repositionQueue = Promise.resolve()

function reposition() {
  repositionQueue = repositionQueue.then(doReposition)
}

async function doReposition() {
  await nextTick()
  const anchor = anchorRef.value
  const el = dropdownRef.value
  if (!anchor || !el) return

  const parent = anchor.parentElement
  if (!parent) {
    measured.value = true
    return
  }
  const parentRect = parent.getBoundingClientRect()
  const isFullWidth = props.width === 'w-full'

  // Position below parent, invisible, so we can measure natural height
  let tempLeft = parentRect.left
  if (props.align === 'right') tempLeft = parentRect.right - parentRect.width
  if (props.align === 'center') tempLeft = parentRect.left

  posStyle.value = {
    position: 'fixed',
    top: `${parentRect.bottom + 4}px`,
    left: `${tempLeft}px`,
    ...(isFullWidth ? { width: `${parentRect.width}px` } : {}),
    visibility: 'hidden',
  }
  measured.value = false
  await nextTick()

  const dropdownRect = el.getBoundingClientRect()

  let placement: 'below' | 'above' = props.placement
  const belowTop = parentRect.bottom + 4
  const aboveTop = parentRect.top - dropdownRect.height - 4

  if (placement === 'below' && belowTop + dropdownRect.height > window.innerHeight && aboveTop >= 0) {
    placement = 'above'
  }

  const top = placement === 'above' ? aboveTop : belowTop
  autoPlacement.value = placement === 'above' ? 'above' : null

  let left: number
  if (props.align === 'right') {
    left = parentRect.right - dropdownRect.width
  } else if (props.align === 'center') {
    left = parentRect.left + parentRect.width / 2 - dropdownRect.width / 2
  } else {
    left = parentRect.left
  }

  const style: Record<string, string> = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }
  if (isFullWidth) {
    style.width = `${parentRect.width}px`
  }
  posStyle.value = style
  measured.value = true
}

watch(() => props.open, (isOpen) => {
  autoPlacement.value = null
  measured.value = false
  if (isOpen) reposition()
})

onMounted(() => {
  if (props.open) reposition()
})

watchEffect((onCleanup) => {
  if (!props.open) return
  const handler = () => reposition()
  window.addEventListener('resize', handler)
  window.addEventListener('scroll', handler, true)
  onCleanup(() => {
    window.removeEventListener('resize', handler)
    window.removeEventListener('scroll', handler, true)
  })
})

defineExpose({
  dropdownRef,
})
</script>

<template>
  <div ref="anchorRef" class="contents">
    <Teleport to="body">
      <div
        v-if="open"
        ref="dropdownRef"
        :class="[
          'fixed bg-white overflow-y-auto max-h-[80vh] z-[60]',
          compact
            ? 'rounded-xl shadow-md shadow-black/[0.06] ring-1 ring-neutral-200/70'
            : 'rounded-2xl shadow-lg ring-1 ring-neutral-200',
          width ?? '',
        ]"
        :style="measured ? posStyle : { ...posStyle, visibility: 'hidden' }"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>
