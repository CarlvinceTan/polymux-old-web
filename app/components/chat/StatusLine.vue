<script setup lang="ts">
withDefaults(
  defineProps<{
    isWorking?: boolean;
    isDone?: boolean;
    /** Solid red — agent stopped mid-run or failed. Wins over working/done when set. */
    isFailed?: boolean;
    /** Narrower track for viewport thumbnails / dense rows */
    small?: boolean;
  }>(),
  {
    isWorking: false,
    isDone: false,
    isFailed: false,
    small: false,
  },
);

const COLS = 14;
const ROWS = 3;
const SPACING = 11;
const RADIUS = 3;
/** "working" bloom — radiates from the center via Manhattan distance. */
const BLOOM_DELAY_PER_TIER_MS = 140;
/** "done" shimmer — wave travels strictly left → right, one column at a time. */
const WAVE_DELAY_PER_COL_MS = 130;
const VIEW_W = (COLS - 1) * SPACING + 2 * RADIUS + 6;
const VIEW_H = (ROWS - 1) * SPACING + 2 * RADIUS + 6;

const dots = computed(() => {
  const cx = (COLS - 1) / 2;
  const cy = (ROWS - 1) / 2;
  const list: Array<{ key: string; x: number; y: number; bloomDelay: number; waveDelay: number }> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const distance = Math.abs(c - cx) + Math.abs(r - cy);
      list.push({
        key: `${r}-${c}`,
        x: 3 + c * SPACING,
        y: 3 + r * SPACING,
        bloomDelay: distance * BLOOM_DELAY_PER_TIER_MS,
        waveDelay: c * WAVE_DELAY_PER_COL_MS,
      });
    }
  }
  return list;
});
</script>

<template>
  <div class="flex h-full shrink-0 items-center">
    <svg
      class="status-line__matrix"
      :class="[
        small ? 'status-line__matrix--small' : 'status-line__matrix--normal',
        {
          'status-line__matrix--failed': isFailed,
          'status-line__matrix--done': !isFailed && isDone,
          'status-line__matrix--working': !isFailed && isWorking && !isDone,
          'status-line__matrix--idle': !isFailed && !isDone && !isWorking,
        },
      ]"
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g>
        <circle
          v-for="dot in dots"
          :key="`base-${dot.key}`"
          class="status-line__dot-base"
          :cx="dot.x"
          :cy="dot.y"
          :r="RADIUS"
        />
      </g>
      <g>
        <circle
          v-for="dot in dots"
          :key="`pulse-${dot.key}`"
          class="status-line__dot-pulse"
          :cx="dot.x"
          :cy="dot.y"
          :r="RADIUS"
          :style="{
            '--bloom-delay': `${dot.bloomDelay}ms`,
            '--wave-delay': `${dot.waveDelay}ms`,
          }"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.status-line__matrix {
  display: block;
  height: 100%;
}

/* Width is left unset so it auto-derives from the viewBox — that keeps the
   grid's natural aspect ratio so dots stay equally spaced regardless of size.
   Heights match the adjacent agent-name text (text-body-md normal,
   text-2xs/caption thumbnail). */
.status-line__matrix--normal {
  width: auto;
  height: 0.875rem;
}

@media (min-width: 640px) {
  .status-line__matrix--normal {
    height: 1rem;
  }
}

.status-line__matrix--small {
  width: auto;
  height: 0.5625rem;
}

@media (min-width: 640px) {
  .status-line__matrix--small {
    height: 0.625rem;
  }
}

.status-line__dot-base {
  fill: rgb(var(--status-line-rgb));
  opacity: 0.08;
}

.status-line__dot-pulse {
  fill: rgb(var(--status-line-rgb));
  opacity: 0;
}

.status-line__matrix--idle {
  --status-line-rgb: 212, 212, 212;
}

.status-line__matrix--idle .status-line__dot-base {
  opacity: 0.4;
}

.status-line__matrix--working {
  --status-line-rgb: 238, 196, 74;
}

.status-line__matrix--done {
  --status-line-rgb: 52, 211, 153;
}

/* Failure: solid red, no animation. Pulse layer hidden via the global rule below;
   the base layer carries the colour at full strength. */
.status-line__matrix--failed {
  --status-line-rgb: 216, 76, 43; /* --color-error-500 */
}

.status-line__matrix--failed .status-line__dot-base {
  opacity: 0.95;
}
</style>

<style>
/* Global so Vue’s scoped selectors don’t rewrite the animation-name (matches
   keyframes defined in ~/assets/css/main.css). */
.status-line__matrix--working .status-line__dot-pulse {
  animation: status-line-dot-pulse 2200ms cubic-bezier(0.16, 1, 0.3, 1) infinite;
  animation-delay: var(--bloom-delay);
}

/* Done: a subtle in-unison pulse — all dots breathe together, staying at full
   green and only easing slightly brighter at the peak. No per-dot delay. */
.status-line__matrix--done .status-line__dot-pulse {
  animation: status-line-dot-shimmer 3200ms ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .status-line__matrix--working .status-line__dot-pulse,
  .status-line__matrix--done .status-line__dot-pulse {
    animation: none;
    opacity: 0.45;
  }
}
</style>
