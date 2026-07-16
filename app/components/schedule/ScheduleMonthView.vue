<script setup lang="ts">
import type { CalendarRun } from '~/composables/workflows/useScheduleCalendar'

export interface CalDay {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  runs: CalendarRun[]
}

const props = defineProps<{
  weeks: CalDay[][]
  displayTz: string
  nextMs: number | null
}>()
const emit = defineEmits<{ addOn: [dateKey: string]; edit: [automationId: string] }>()

const { t, locale } = useI18n()

const dowLabels = computed(() => {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
  return keys.map(k => t(`schedule.weekdayLong.${k}`).slice(0, 3))
})

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    timeZone: props.displayTz, hour: 'numeric', minute: '2-digit', hour12: false,
  }).format(new Date(ms))
}

const MAX_VISIBLE = 3
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col p-3">
    <div class="grid grid-cols-7 px-1 pb-2">
      <div
        v-for="d in dowLabels"
        :key="d"
        class="px-2.5 text-right text-2xs font-semibold uppercase tracking-wider text-neutral-400"
      >
        {{ d }}
      </div>
    </div>
    <div class="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-hidden rounded-lg bg-neutral-100">
      <template v-for="(week, wi) in weeks" :key="wi">
        <div
          v-for="day in week"
          :key="day.key"
          class="group/cell flex min-h-0 flex-col gap-0.5 overflow-hidden border-b border-r border-neutral-100 bg-white px-1.5 py-1 last:border-r-0 [&:nth-child(7n)]:border-r-0"
          :class="day.inMonth ? '' : 'bg-neutral-50/80'"
        >
          <div class="flex items-center justify-between">
            <button
              type="button"
              class="flex size-5 items-center justify-center rounded-full text-caption opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-900 group-hover/cell:opacity-100"
              :title="t('schedule.addTitle')"
              @click="emit('addOn', day.key)"
            >
              <UIcon name="i-heroicons-plus" class="size-3 text-neutral-500" />
            </button>
            <span
              class="text-caption font-medium tabular-nums"
              :class="[
                day.isToday ? 'flex size-5 items-center justify-center rounded-full bg-neutral-950 font-semibold text-white' : '',
                day.inMonth ? 'text-neutral-700' : 'text-neutral-300',
              ]"
            >{{ day.day }}</span>
          </div>
          <div class="flex min-h-0 flex-col gap-0.5 overflow-hidden">
            <button
              v-for="run in day.runs.slice(0, MAX_VISIBLE)"
              :key="run.key"
              type="button"
              class="flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-left text-caption transition-colors"
              :class="!run.active
                ? 'border-neutral-200 bg-neutral-100 text-neutral-400 hover:border-neutral-300'
                : run.ms === nextMs
                  ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                  : run.recurring
                    ? 'border-emerald-100 bg-emerald-50/70 text-emerald-800 hover:border-emerald-200'
                    : 'border-dashed border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:border-emerald-300'"
              :title="`${run.workflowName} · ${fmtTime(run.ms)}`"
              @click="emit('edit', run.automationId)"
            >
              <span
                v-if="run.ms === nextMs"
                class="size-1.5 shrink-0 rounded-full bg-emerald-500"
              />
              <span class="min-w-0 flex-1 truncate font-medium">{{ run.workflowName }}</span>
              <span class="shrink-0 font-mono text-2xs" :class="run.active ? 'text-emerald-600' : 'text-neutral-400'">{{ fmtTime(run.ms) }}</span>
            </button>
            <button
              v-if="day.runs.length > MAX_VISIBLE"
              type="button"
              class="px-1.5 text-left text-2xs text-neutral-500 hover:text-neutral-900"
              @click="emit('addOn', day.key)"
            >
              {{ t('schedule.moreRuns', { n: day.runs.length - MAX_VISIBLE }) }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
