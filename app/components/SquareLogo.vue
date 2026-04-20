<script setup lang="ts">
type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<
  LogoSize,
  { root: string; mark: string; text: string; gap: string }
> = {
  sm: {
    root: 'size-16',
    mark: 'size-9 shrink-0',
    text: 'text-[0.625rem] font-semibold tracking-tight leading-none',
    gap: 'gap-1',
  },
  md: {
    root: 'size-24',
    mark: 'size-[3.25rem] shrink-0',
    text: 'text-xs font-semibold tracking-tight leading-none',
    gap: 'gap-1.5',
  },
  lg: {
    root: 'size-32',
    mark: 'size-[4.25rem] shrink-0',
    text: 'text-sm font-semibold tracking-tight leading-none',
    gap: 'gap-2',
  },
  xl: {
    root: 'size-40',
    mark: 'size-[5.25rem] shrink-0',
    text: 'text-base font-semibold tracking-tight leading-none',
    gap: 'gap-2.5',
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
