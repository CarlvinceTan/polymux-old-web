<script setup lang="ts">
withDefaults(
  defineProps<{
    isWorking?: boolean;
    isDone?: boolean;
    /** Tighter bar for compact layouts (e.g. Viewport grid) */
    compact?: boolean;
  }>(),
  {
    isWorking: false,
    isDone: false,
    compact: false,
  },
);
</script>

<template>
  <div class="flex h-full shrink-0 items-center">
    <div
      class="status-line__track"
      :class="compact ? 'h-1 w-20 sm:w-24' : 'h-2 w-28 sm:w-32'"
    >
      <div
        class="status-line__fill"
        :class="{
          'status-line__fill--done': isDone,
          'status-line__fill--working': isWorking && !isDone,
          'status-line__fill--idle': !isDone && !isWorking,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.status-line__track {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-line__fill {
  width: 100%;
  height: 100%;
  transform-origin: center;
  border-radius: 9999px;
}

.status-line__fill--idle {
  --line-rgb: 212, 212, 212;
  --line-a-peak: 0.92;
  background: linear-gradient(
    90deg,
    rgba(var(--line-rgb), 0) 0%,
    rgba(var(--line-rgb), 0.03) 5%,
    rgba(var(--line-rgb), 0.1) 12%,
    rgba(var(--line-rgb), 0.22) 20%,
    rgba(var(--line-rgb), 0.45) 30%,
    rgba(var(--line-rgb), 0.72) 41%,
    rgba(var(--line-rgb), var(--line-a-peak)) 48%,
    rgba(var(--line-rgb), var(--line-a-peak)) 52%,
    rgba(var(--line-rgb), 0.72) 59%,
    rgba(var(--line-rgb), 0.45) 70%,
    rgba(var(--line-rgb), 0.22) 80%,
    rgba(var(--line-rgb), 0.1) 88%,
    rgba(var(--line-rgb), 0.03) 95%,
    rgba(var(--line-rgb), 0) 100%
  );
}

.status-line__fill--working {
  --line-rgb: 238, 196, 74;
  --line-a-peak: 0.96;
  background: linear-gradient(
    90deg,
    rgba(var(--line-rgb), 0) 0%,
    rgba(var(--line-rgb), 0.04) 5%,
    rgba(var(--line-rgb), 0.12) 12%,
    rgba(var(--line-rgb), 0.26) 20%,
    rgba(var(--line-rgb), 0.5) 30%,
    rgba(var(--line-rgb), 0.78) 41%,
    rgba(var(--line-rgb), var(--line-a-peak)) 48%,
    rgba(var(--line-rgb), var(--line-a-peak)) 52%,
    rgba(var(--line-rgb), 0.78) 59%,
    rgba(var(--line-rgb), 0.5) 70%,
    rgba(var(--line-rgb), 0.26) 80%,
    rgba(var(--line-rgb), 0.12) 88%,
    rgba(var(--line-rgb), 0.04) 95%,
    rgba(var(--line-rgb), 0) 100%
  );
}

.status-line__fill--done {
  --line-rgb: 52, 211, 153;
  --line-a-peak: 0.96;
  background: linear-gradient(
    90deg,
    rgba(var(--line-rgb), 0) 0%,
    rgba(var(--line-rgb), 0.04) 5%,
    rgba(var(--line-rgb), 0.12) 12%,
    rgba(var(--line-rgb), 0.26) 20%,
    rgba(var(--line-rgb), 0.5) 30%,
    rgba(var(--line-rgb), 0.78) 41%,
    rgba(var(--line-rgb), var(--line-a-peak)) 48%,
    rgba(var(--line-rgb), var(--line-a-peak)) 52%,
    rgba(var(--line-rgb), 0.78) 59%,
    rgba(var(--line-rgb), 0.5) 70%,
    rgba(var(--line-rgb), 0.26) 80%,
    rgba(var(--line-rgb), 0.12) 88%,
    rgba(var(--line-rgb), 0.04) 95%,
    rgba(var(--line-rgb), 0) 100%
  );
}
</style>

<style>
/* Global keyframes in ~/assets/css/main.css — unscoped so Vue doesn’t rewrite animation-name */
.status-line__fill.status-line__fill--working,
.status-line__fill.status-line__fill--done {
  animation: status-line-pulse 2.2s ease-in-out infinite;
}
</style>
