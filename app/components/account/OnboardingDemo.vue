<script setup lang="ts">
const props = defineProps<{
  src: string
  poster?: string
  label: string
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const failed = ref(false)
const ready = ref(false)

function onCanPlay() {
  ready.value = true
}

function onError() {
  failed.value = true
}

watch(
  () => props.src,
  () => {
    failed.value = false
    ready.value = false
  },
)

onMounted(async () => {
  await nextTick()
  videoRef.value?.play().catch(() => {})
})
</script>

<template>
  <div class="relative h-full w-full">
    <video
      v-if="!failed"
      ref="videoRef"
      class="h-full w-full object-cover transition-opacity duration-300"
      :class="ready ? 'opacity-100' : 'opacity-0'"
      :src="src"
      :poster="poster"
      muted
      playsinline
      loop
      autoplay
      preload="metadata"
      @canplay="onCanPlay"
      @error="onError"
    />
    <div
      v-if="failed || !ready"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-400"
      :class="failed ? 'opacity-100' : 'opacity-70'"
    >
      <svg
        class="size-10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="0.75"
        aria-hidden="true"
      >
        <polygon points="5 3 19 12 5 21" />
      </svg>
      <span class="text-xs font-medium">{{ label }}</span>
    </div>
  </div>
</template>
