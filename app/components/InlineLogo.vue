<script setup lang="ts">
type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<LogoSize, { mark: string; text: string; gap: string }> = {
  sm: {
    mark: 'size-5 shrink-0',
    text: 'text-sm font-semibold tracking-tight leading-none',
    gap: 'gap-0.5',
  },
  md: {
    mark: 'size-7 shrink-0',
    text: 'text-base font-semibold tracking-tight leading-none',
    gap: 'gap-1',
  },
  lg: {
    mark: 'size-9 shrink-0',
    text: 'text-lg font-semibold tracking-tight leading-none',
    gap: 'gap-1',
  },
  xl: {
    mark: 'size-10 shrink-0',
    text: 'text-xl font-semibold tracking-tight leading-none',
    gap: 'gap-1.5',
  },
}

const props = withDefaults(
  defineProps<{
    size?: LogoSize
  }>(),
  { size: 'md' },
)

const s = computed(() => SIZES[props.size])
</script>

<template>
  <div
    class="inline-flex items-center text-[var(--color-on-surface)]"
    :class="[s.gap]"
  >
    <PolymuxLogo :class="s.mark" />
    <span :class="s.text">Polymux</span>
  </div>
</template>
