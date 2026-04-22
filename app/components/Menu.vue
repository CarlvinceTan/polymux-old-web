<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    /** `below`: under trigger (e.g. workspace). `above`: above trigger (e.g. sidebar footer). */
    placement?: 'below' | 'above'
    /** `left`: anchored to left edge (default). `right`: anchored to right edge. */
    align?: 'left' | 'right'
    /** Override the default `w-full` with a fixed width class e.g. `"w-40"`. */
    width?: string
  }>(),
  { placement: 'below', align: 'left' },
)

const dropdownRef = ref<HTMLElement | null>(null)
const autoPlacement = ref<'below' | 'above' | null>(null)
const measured = ref(false)

const effectivePlacement = computed(() => autoPlacement.value ?? props.placement)

async function measureAndFlip() {
  await nextTick()
  const el = dropdownRef.value
  if (!el) return
  const parent = el.parentElement
  if (!parent) {
    measured.value = true
    return
  }
  if (props.placement === 'below') {
    const rect = el.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      const parentRect = parent.getBoundingClientRect()
      if (parentRect.top >= rect.height + 8) {
        autoPlacement.value = 'above'
        await nextTick()
      }
    }
  }
  measured.value = true
}

watch(() => props.open, (isOpen) => {
  autoPlacement.value = null
  measured.value = false
  if (isOpen) measureAndFlip()
})

onMounted(() => {
  if (props.open) measureAndFlip()
})

defineExpose({
  dropdownRef,
})
</script>

<template>
  <div
    v-if="open"
    ref="dropdownRef"
    :class="[
      'absolute rounded-2xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden z-50',
      align === 'right' ? 'right-0' : 'left-0',
      width ?? 'w-full',
      effectivePlacement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
    ]"
    :style="!measured ? { visibility: 'hidden' } : undefined"
  >
    <slot />
  </div>
</template>
