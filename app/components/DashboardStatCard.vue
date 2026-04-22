<script setup lang="ts">
defineProps<{
  label: string
  value: string
  icon?: string
  trend?: string
  trendDirection?: 'up' | 'down' | 'neutral'
  to?: string
}>()
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="group flex flex-col gap-3 rounded-xl border border-neutral-200/70 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
        {{ label }}
      </h3>
      <div
        v-if="icon"
        class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 transition-colors group-hover:bg-neutral-950 group-hover:text-white"
      >
        <UIcon :name="icon" class="size-4" />
      </div>
    </div>
    <p class="font-mono text-2xl font-bold tracking-tight text-neutral-950">
      {{ value }}
    </p>
    <p
      v-if="trend"
      class="text-[11px] font-medium"
      :class="
        trendDirection === 'up'
          ? 'text-green-600'
          : trendDirection === 'down'
            ? 'text-red-600'
            : 'text-neutral-400'
      "
    >
      {{ trend }}
    </p>
  </NuxtLink>
  <div
    v-else
    class="flex flex-col gap-3 rounded-xl border border-neutral-200/70 bg-white p-4 transition-colors hover:border-neutral-300"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
        {{ label }}
      </h3>
      <div
        v-if="icon"
        class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
      >
        <UIcon :name="icon" class="size-4" />
      </div>
    </div>
    <p class="font-mono text-2xl font-bold tracking-tight text-neutral-950">
      {{ value }}
    </p>
    <p
      v-if="trend"
      class="text-[11px] font-medium"
      :class="
        trendDirection === 'up'
          ? 'text-green-600'
          : trendDirection === 'down'
            ? 'text-red-600'
            : 'text-neutral-400'
      "
    >
      {{ trend }}
    </p>
  </div>
</template>
