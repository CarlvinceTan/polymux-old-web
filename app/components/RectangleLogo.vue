<script setup lang="ts">
type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<
  LogoSize,
  { root: string; mark: string; text: string; gap: string }
> = {
  sm: {
    root: 'h-11 w-28',
    mark: 'size-5 shrink-0',
    text: 'text-[0.5625rem] font-semibold tracking-tight leading-tight',
    gap: 'gap-0.5',
  },
  md: {
    root: 'h-12 w-36',
    mark: 'size-6 shrink-0',
    text: 'text-[0.625rem] font-semibold tracking-tight leading-tight',
    gap: 'gap-1',
  },
  lg: {
    root: 'h-14 w-44',
    mark: 'size-7 shrink-0',
    text: 'text-xs font-semibold tracking-tight leading-tight',
    gap: 'gap-1',
  },
  xl: {
    root: 'h-16 w-52',
    mark: 'size-8 shrink-0',
    text: 'text-sm font-semibold tracking-tight leading-tight',
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
    class="inline-flex flex-col items-center justify-center text-center text-[var(--color-on-surface)]"
    :class="[s.root, s.gap]"
  >
    <PolymuxLogo :class="s.mark" />
    <span :class="s.text">Polymux</span>
  </div>
</template>
