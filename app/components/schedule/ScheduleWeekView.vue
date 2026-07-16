<script setup lang="ts">
import type { CalendarRun } from '~/composables/workflows/useScheduleCalendar'

export interface WeekRun extends CalendarRun { minutes: number }
export interface WeekDay {
  key: string
  dow: string
  dayNum: number
  isToday: boolean
  runs: WeekRun[]
}

const props = defineProps<{
  days: WeekDay[]
  displayTz: string
  showNow: boolean
  nowMinutes: number
  nextMs: number | null
}>()
const emit = defineEmits<{ edit: [automationId: string]; addOn: [dateKey: string] }>()

const { locale } = useI18n()

const HOUR = 44 // px per hour row
const hours = Array.from({ length: 24 }, (_, h) => h)

function hourLabel(h: number): string {
  if (h === 0) return ''
  const d = new Date(2000, 0, 1, h, 0)
  return new Intl.DateTimeFormat(locale.value, { hour: 'numeric', hour12: true }).format(d)
}
function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    timeZone: props.displayTz, hour: 'numeric', minute: '2-digit', hour12: false,
  }).format(new Date(ms))
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- day header -->
    <div class="grid shrink-0 border-b border-neutral-200" style="grid-template-columns:56px repeat(7,1fr)">
      <div class="border-r border-neutral-200" />
      <div
        v-for="d in days"
        :key="d.key"
        class="border-r border-neutral-200 py-1.5 text-center last:border-r-0"
      >
        <div class="text-2xs font-semibold uppercase tracking-wider text-neutral-400">{{ d.dow }}</div>
        <div
          class="mx-auto mt-0.5 text-body-md font-semibold tabular-nums"
          :class="d.isToday ? 'flex size-6 items-center justify-center rounded-full bg-neutral-950 text-white' : 'text-neutral-800'"
        >{{ d.dayNum }}</div>
      </div>
    </div>

    <!-- scrollable time grid -->
    <div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
      <div class="relative grid" style="grid-template-columns:56px repeat(7,1fr)">
        <!-- hour gutter -->
        <div class="border-r border-neutral-200">
          <div v-for="h in hours" :key="h" class="relative border-b border-neutral-100" :style="{ height: HOUR + 'px' }">
            <span class="absolute -top-3.5 right-2 bg-white px-0.5 font-mono text-2xs leading-none text-neutral-400">{{ hourLabel(h) }}</span>
          </div>
        </div>
        <!-- day columns -->
        <div
          v-for="d in days"
          :key="d.key"
          class="relative border-r border-neutral-200 last:border-r-0"
          :class="d.isToday ? 'bg-neutral-50/40' : ''"
        >
          <div v-for="h in hours" :key="h" class="border-b border-neutral-100" :style="{ height: HOUR + 'px' }" />
          <button
            v-for="run in d.runs"
            :key="run.key"
            type="button"
            class="absolute inset-x-1 flex flex-col justify-center overflow-hidden rounded-md border px-1.5 text-left transition-colors"
            :class="!run.active
              ? 'border-neutral-200 bg-neutral-100 hover:border-neutral-300'
              : run.ms === nextMs
                ? 'border-emerald-200 bg-emerald-100'
                : run.recurring
                  ? 'border-emerald-100 bg-emerald-50/70 hover:border-emerald-200'
                  : 'border-dashed border-emerald-200 bg-emerald-50/40 hover:border-emerald-300'"
            :style="{ top: (run.minutes / 60 * HOUR) + 'px', height: '30px' }"
            @click="emit('edit', run.automationId)"
          >
            <span class="truncate text-2xs font-semibold" :class="run.active ? 'text-emerald-800' : 'text-neutral-400'">{{ run.workflowName }}</span>
            <span class="truncate font-mono text-2xs" :class="run.active ? 'text-emerald-600' : 'text-neutral-400'">{{ fmtTime(run.ms) }}</span>
          </button>
        </div>
        <!-- now line -->
        <div
          v-if="showNow"
          class="pointer-events-none absolute z-10 h-px bg-emerald-500"
          :style="{ top: (nowMinutes / 60 * HOUR) + 'px', left: '56px', right: '0' }"
        >
          <span class="absolute -left-[52px] -top-2 bg-white px-0.5 font-mono text-2xs font-semibold text-emerald-600">
            {{ String(Math.floor(nowMinutes / 60)).padStart(2, '0') }}:{{ String(nowMinutes % 60).padStart(2, '0') }}
          </span>
          <span class="absolute -left-1 -top-[3px] size-2 rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  </div>
</template>
