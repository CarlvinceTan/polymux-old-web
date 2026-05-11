<script setup lang="ts">
import { computeNextRuns } from '~/utils/cron'
import type { WorkflowSummary } from '~/composables/workflows/useWorkflowList'
import type { ScheduledWorkflowView } from '~/composables/workflows/useScheduledWorkflows'

const { t } = useI18n()
const { headerTabs } = useDashboardNavTabs()
const { sessions, fetchSessions, runningOverrides } = useWorkflowList()
const { active: activeSchedules, fetchList: fetchSchedules, runsPerMonth } = useScheduledWorkflows()
const { currentWorkspaceId, waitForWorkspace } = useWorkspaces()
const { relativeTime } = useRelativeTime()

async function loadAll(opts?: { force?: boolean }) {
  if (!currentWorkspaceId.value) await waitForWorkspace()
  await Promise.all([
    fetchSessions(opts),
    fetchSchedules(opts?.force),
  ])
}

onMounted(() => loadAll())
useOnReconnect(() => loadAll({ force: true }))

// Live clock so "next run in …" stays current without a refresh.
const now = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickHandle = setInterval(() => { now.value = Date.now() }, 30_000)
})
onBeforeUnmount(() => {
  if (tickHandle) clearInterval(tickHandle)
})

interface RunRow {
  id: string
  title: string
  kind: 'chat' | 'workflow'
  startedAt: string
}

const projectedSessions = computed<WorkflowSummary[]>(() => {
  const overrides = runningOverrides.value
  return sessions.value.map((s) => {
    const o = overrides[s.id]
    return o ? { ...s, is_running: o.is_running, running_kind: o.running_kind } : s
  })
})

const activeRuns = computed<RunRow[]>(() =>
  projectedSessions.value
    .filter(s => s.is_running)
    .map(s => ({
      id: s.id,
      title: s.title?.trim() || t('dashboard.untitledSession'),
      kind: (s.running_kind === 'workflow' ? 'workflow' : 'chat') as 'workflow' | 'chat',
      startedAt: s.updated_at,
    }))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
)

const recentRuns = computed<WorkflowSummary[]>(() =>
  [...sessions.value]
    .filter(s => !s.is_draft)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10),
)

function frequencyLabel(freq: string): string {
  switch (freq) {
    case 'hourly': return t('console.freqHourly')
    case 'daily': return t('console.freqDaily')
    case 'weekly': return t('console.freqWeekly')
    case 'monthly': return t('console.freqMonthly')
    case 'custom': return t('console.freqCustom')
    case 'none': return t('console.freqNone')
    default: return freq
  }
}

interface ScheduleRow {
  cfg: ScheduledWorkflowView
  freqLabel: string
  runsPerMonth: number
  nextRunMs: number | null
}

const scheduleRows = computed<ScheduleRow[]>(() => {
  // `now` is read to keep this reactive against the live clock.
  const ref = now.value
  return activeSchedules.value.map((cfg) => {
    let nextRunMs: number | null = null
    const upcomingOneOff = (cfg.one_off_ms ?? [])
      .filter(ms => ms > ref)
      .sort((a, b) => a - b)[0]
    if (cfg.frequency === 'custom' && cfg.cron_expression) {
      const runs = computeNextRuns(cfg.cron_expression, cfg.timezone || 'UTC', 1)
      const cronNext = runs[0]?.getTime() ?? null
      nextRunMs = upcomingOneOff && cronNext
        ? Math.min(upcomingOneOff, cronNext)
        : upcomingOneOff ?? cronNext
    } else {
      nextRunMs = upcomingOneOff ?? null
    }
    return {
      cfg,
      freqLabel: frequencyLabel(cfg.frequency),
      runsPerMonth: Math.round(runsPerMonth(cfg)),
      nextRunMs,
    }
  }).sort((a, b) => {
    const an = a.nextRunMs ?? Number.POSITIVE_INFINITY
    const bn = b.nextRunMs ?? Number.POSITIVE_INFINITY
    return an - bn
  })
})

function formatNextRun(ms: number | null): string {
  if (ms == null) return t('console.nextRunUnknown')
  const diff = ms - now.value
  if (diff <= 0) return t('console.nextRunDue')
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return t('console.inMinutes', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('console.inHours', { n: hours })
  const days = Math.round(hours / 24)
  return t('console.inDays', { n: days })
}

function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString()
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader
        :tabs="headerTabs"
        raw-tab-labels
      />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto">
          <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
            <!-- Heading -->
            <div>
              <h1 class="text-lg font-semibold text-neutral-950">
                {{ t('console.title') }}
              </h1>
              <p class="mt-1 text-sm text-neutral-500">
                {{ t('console.subtitle') }}
              </p>
            </div>

            <!-- Stat strip -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div class="rounded-2xl border border-neutral-200/70 bg-white p-4">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  {{ t('console.statActive') }}
                </p>
                <p class="mt-1 font-mono text-2xl font-bold text-neutral-950">
                  {{ activeRuns.length }}
                </p>
              </div>
              <div class="rounded-2xl border border-neutral-200/70 bg-white p-4">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  {{ t('console.statSchedules') }}
                </p>
                <p class="mt-1 font-mono text-2xl font-bold text-neutral-950">
                  {{ scheduleRows.length }}
                </p>
              </div>
              <div class="rounded-2xl border border-neutral-200/70 bg-white p-4">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  {{ t('console.statRunsPerMonth') }}
                </p>
                <p class="mt-1 font-mono text-2xl font-bold text-neutral-950">
                  {{ scheduleRows.reduce((sum, r) => sum + r.runsPerMonth, 0) }}
                </p>
              </div>
            </div>

            <!-- Active runs -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('console.activeRuns') }}
                  </h2>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ t('console.activeRunsDesc') }}
                  </p>
                </div>
                <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  <span class="size-1.5 rounded-full bg-emerald-500" />
                  {{ activeRuns.length }} {{ t('console.live') }}
                </span>
              </header>

              <ul v-if="activeRuns.length" class="-mx-2 flex flex-col">
                <li v-for="run in activeRuns" :key="run.id">
                  <NuxtLink
                    :to="`/workflow/${run.id}/agent`"
                    class="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-neutral-50"
                  >
                    <span class="flex size-7 items-center justify-center rounded-md bg-emerald-50">
                      <svg
                        v-if="run.kind === 'workflow'"
                        class="size-3.5 -rotate-90"
                        viewBox="0 0 16 16"
                      >
                        <circle cx="8" cy="8" r="6" fill="none" stroke="rgb(16 185 129 / 0.25)" stroke-width="2" />
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="rgb(16 185 129)"
                          stroke-width="2"
                          stroke-linecap="butt"
                          pathLength="100"
                          stroke-dasharray="25 100"
                        />
                      </svg>
                      <span
                        v-else
                        class="size-3.5 animate-spin rounded-full border-2 border-emerald-500/25 border-t-emerald-500"
                      />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-neutral-950">
                        {{ run.title }}
                      </p>
                      <p class="mt-0.5 text-[11px] text-neutral-400">
                        {{ run.kind === 'workflow' ? t('console.kindWorkflow') : t('console.kindChat') }}
                        · {{ relativeTime(run.startedAt) }}
                      </p>
                    </div>
                    <UIcon
                      name="i-heroicons-arrow-up-right-20-solid"
                      class="size-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </NuxtLink>
                </li>
              </ul>
              <div
                v-else
                class="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-center"
              >
                <UIcon name="i-heroicons-bolt" class="size-5 text-neutral-400" />
                <p class="text-[12px] font-medium text-neutral-700">
                  {{ t('console.noActive') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('console.noActiveHint') }}
                </p>
              </div>
            </section>

            <!-- Schedules -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('console.schedules') }}
                  </h2>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ t('console.schedulesDesc') }}
                  </p>
                </div>
                <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  <span class="size-1.5 rounded-full bg-neutral-900" />
                  {{ scheduleRows.length }} {{ t('console.active') }}
                </span>
              </header>

              <ul v-if="scheduleRows.length" class="divide-y divide-neutral-100 border-t border-neutral-100">
                <li
                  v-for="row in scheduleRows"
                  :key="row.cfg.workflow_id"
                  class="flex items-center justify-between gap-3 py-3"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="flex size-7 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                      <UIcon name="i-heroicons-clock" class="size-3.5" />
                    </span>
                    <div class="min-w-0">
                      <NuxtLink
                        :to="`/workflow/${row.cfg.workflow_id}/schedule`"
                        class="block truncate text-[13px] font-medium text-neutral-950 hover:underline"
                      >
                        {{ row.cfg.workflow_name }}
                      </NuxtLink>
                      <p class="text-[10px] text-neutral-400">
                        {{ row.freqLabel }} · {{ row.runsPerMonth }}/mo · {{ row.cfg.timezone || 'UTC' }}
                      </p>
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-[11px] font-semibold text-neutral-950">
                      {{ formatNextRun(row.nextRunMs) }}
                    </p>
                    <p v-if="row.nextRunMs" class="font-mono text-[10px] text-neutral-400">
                      {{ formatAbsolute(row.nextRunMs) }}
                    </p>
                  </div>
                </li>
              </ul>
              <div
                v-else
                class="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-center"
              >
                <UIcon name="i-heroicons-calendar-days" class="size-5 text-neutral-400" />
                <p class="text-[12px] font-medium text-neutral-700">
                  {{ t('console.noSchedules') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('console.noSchedulesHint') }}
                </p>
              </div>
            </section>

            <!-- Recent runs -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('console.recentRuns') }}
                  </h2>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ t('console.recentRunsDesc') }}
                  </p>
                </div>
                <NuxtLink
                  to="/workflow/"
                  class="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  {{ t('dashboard.viewAll') }}
                  <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3" />
                </NuxtLink>
              </header>

              <ul v-if="recentRuns.length" class="-mx-2 flex flex-col">
                <li v-for="run in recentRuns" :key="run.id">
                  <NuxtLink
                    :to="`/workflow/${run.id}/agent`"
                    class="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-neutral-50"
                  >
                    <span
                      class="size-1.5 shrink-0 rounded-full"
                      :class="run.is_running ? 'bg-emerald-500' : 'bg-neutral-300'"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-neutral-950">
                        {{ run.title?.trim() || t('dashboard.untitledSession') }}
                      </p>
                      <p class="mt-0.5 text-[11px] text-neutral-400">
                        {{ relativeTime(run.updated_at) }}
                      </p>
                    </div>
                    <UIcon
                      name="i-heroicons-arrow-up-right-20-solid"
                      class="size-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </NuxtLink>
                </li>
              </ul>
              <div
                v-else
                class="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-center"
              >
                <UIcon name="i-heroicons-chat-bubble-oval-left-ellipsis-20-solid" class="size-5 text-neutral-400" />
                <p class="text-[12px] font-medium text-neutral-700">
                  {{ t('dashboard.noSessions') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('dashboard.noSessionsHint') }}
                </p>
              </div>
            </section>

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
