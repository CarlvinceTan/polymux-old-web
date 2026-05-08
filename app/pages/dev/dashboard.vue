<script setup lang="ts">
definePageMeta({ layout: 'dev' })
useHead({ title: 'Dashboard — Polymux Developers' })

const stats = [
  { label: 'Tool calls (30d)', value: '12,481', delta: '+8.4%', deltaTone: 'positive' as const, icon: 'i-heroicons-bolt-20-solid' },
  { label: 'Active integrations', value: '3', delta: '+1', deltaTone: 'positive' as const, icon: 'i-heroicons-squares-plus-20-solid' },
  { label: 'Webhook deliveries', value: '832', delta: '99.4% ok', deltaTone: 'neutral' as const, icon: 'i-heroicons-arrow-uturn-right-20-solid' },
  { label: 'Errors', value: '4', delta: '-2', deltaTone: 'positive' as const, icon: 'i-heroicons-exclamation-triangle-20-solid' },
]

const sparklineRaw = [42, 51, 47, 58, 63, 60, 72, 78, 71, 84, 88, 81, 92, 95, 102, 98, 110, 115, 108, 121, 130, 124, 138, 142, 151, 148, 162, 169, 175, 184]
const sparkMin = Math.min(...sparklineRaw)
const sparkMax = Math.max(...sparklineRaw)
const sparkW = 600
const sparkH = 140
const sparkPoints = sparklineRaw
  .map((v, i) => {
    const x = (i / (sparklineRaw.length - 1)) * sparkW
    const y = sparkH - ((v - sparkMin) / (sparkMax - sparkMin)) * sparkH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  .join(' ')

const activity = [
  { time: '14:02', integration: 'Slack Notifier', event: 'tool.invoked', status: 'ok' as const },
  { time: '14:01', integration: 'GitHub Actions', event: 'webhook.delivered', status: 'ok' as const },
  { time: '13:58', integration: 'Stripe Reporter', event: 'webhook.retry', status: 'warn' as const },
  { time: '13:55', integration: 'Slack Notifier', event: 'tool.invoked', status: 'ok' as const },
  { time: '13:51', integration: 'Drive Importer', event: 'oauth.refresh', status: 'ok' as const },
]

const statusIcon = {
  ok: { icon: 'i-heroicons-check-circle-20-solid', cls: 'text-emerald-500' },
  warn: { icon: 'i-heroicons-exclamation-triangle-20-solid', cls: 'text-amber-500' },
  err: { icon: 'i-heroicons-x-circle-20-solid', cls: 'text-rose-500' },
}
</script>

<template>
  <div class="bg-neutral-50">
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header class="flex flex-col gap-2 border-b border-neutral-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Dashboard
          </p>
          <h1 class="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            Overview
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-relaxed text-neutral-600">
            Live integration metrics and recent activity. Numbers are illustrative until real data lands.
          </p>
        </div>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
          <span class="size-1.5 rounded-full bg-emerald-500" />
          All systems operational
        </span>
      </header>

      <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DevStatCard
          v-for="s in stats"
          :key="s.label"
          :label="s.label"
          :value="s.value"
          :delta="s.delta"
          :delta-tone="s.deltaTone"
          :icon="s.icon"
        />
      </div>

      <section class="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold text-neutral-950">
              Tool calls per day
            </h2>
            <p class="text-xs text-neutral-500">
              Last 30 days · scaled to range
            </p>
          </div>
          <div class="flex items-center gap-3 text-xs text-neutral-500">
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-neutral-950" />
              Tool calls
            </span>
          </div>
        </div>

        <svg
          class="mt-4 w-full"
          :viewBox="`0 0 ${sparkW} ${sparkH + 8}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#0a0a0a" stop-opacity="0.18" />
              <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0" />
            </linearGradient>
          </defs>
          <polygon
            :points="`0,${sparkH} ${sparkPoints} ${sparkW},${sparkH}`"
            fill="url(#sparkFill)"
          />
          <polyline
            :points="sparkPoints"
            fill="none"
            stroke="#0a0a0a"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>
      </section>

      <section class="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 class="text-base font-semibold text-neutral-950">
            Recent activity
          </h2>
          <NuxtLink to="/dev/integrations" class="text-xs font-medium text-neutral-500 hover:text-neutral-800">
            View all →
          </NuxtLink>
        </div>
        <table class="min-w-full divide-y divide-neutral-200 text-sm">
          <thead>
            <tr class="bg-neutral-50">
              <th scope="col" class="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Time
              </th>
              <th scope="col" class="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Integration
              </th>
              <th scope="col" class="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Event
              </th>
              <th scope="col" class="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200">
            <tr v-for="row in activity" :key="`${row.time}-${row.event}`">
              <td class="px-5 py-3 font-mono text-xs text-neutral-500">
                {{ row.time }}
              </td>
              <td class="px-5 py-3 font-medium text-neutral-900">
                {{ row.integration }}
              </td>
              <td class="px-5 py-3 font-mono text-xs text-neutral-700">
                {{ row.event }}
              </td>
              <td class="px-5 py-3">
                <span class="inline-flex items-center gap-1.5">
                  <UIcon :name="statusIcon[row.status].icon" class="size-4" :class="statusIcon[row.status].cls" />
                  <span class="text-xs uppercase tracking-wider text-neutral-500">{{ row.status }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
