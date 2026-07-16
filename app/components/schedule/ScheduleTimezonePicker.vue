<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

// Searchable timezone selector. Used for the calendar's display timezone (the
// toolbar) and for a schedule's own timezone (the add/edit popover).
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [tz: string] }>()

const { t } = useI18n()

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

const allTimezones: string[] = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Toronto', 'America/Mexico_City',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Atlantic/Reykjavik',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Rome', 'Europe/Zurich', 'Europe/Stockholm',
  'Europe/Athens', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos',
  'Africa/Nairobi', 'Africa/Johannesburg', 'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai',
  'Asia/Taipei', 'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth',
  'Australia/Sydney', 'Pacific/Auckland',
]

const open = ref(false)
const query = ref('')
const rootRef = ref<HTMLElement | null>(null)

onClickOutside(rootRef, () => { open.value = false })

function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
  }
  catch { return '' }
}
function tzCity(tz: string): string {
  if (tz === 'UTC') return 'UTC'
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
}

const pinnedTimezones = computed(() => {
  const pins: string[] = ['UTC']
  if (localTz && !pins.includes(localTz)) pins.unshift(localTz)
  return pins
})
const filteredTimezones = computed(() => {
  const q = query.value.trim().toLowerCase()
  const base = allTimezones.filter(z => !pinnedTimezones.value.includes(z))
  if (!q) return base
  return base.filter(z => z.toLowerCase().includes(q) || tzCity(z).toLowerCase().includes(q))
})

function pick(tz: string) {
  emit('update:modelValue', tz)
  open.value = false
  query.value = ''
}

const triggerOffset = computed(() => tzOffset(props.modelValue))
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="inline-flex h-[28px] items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-caption text-neutral-700 transition-colors hover:border-neutral-400"
      :class="open ? 'border-neutral-950' : ''"
      :title="t('schedule.timezone')"
      @click="open = !open"
    >
      <UIcon name="i-heroicons-globe-alt" class="size-3.5 shrink-0 text-neutral-500" />
      <span class="flex items-center font-medium leading-none">{{ tzCity(modelValue) }}</span>
      <span v-if="triggerOffset" class="flex items-center font-mono leading-none text-neutral-500 tabular-nums">{{ triggerOffset }}</span>
      <UIcon
        name="i-heroicons-chevron-down-20-solid"
        class="size-3 text-neutral-400 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
    >
      <div class="flex items-center gap-2 border-b border-neutral-200/80 px-3 py-2">
        <UIcon name="i-heroicons-magnifying-glass" class="size-3.5 shrink-0 text-neutral-400" />
        <input
          v-model="query"
          name="tz-search"
          type="text"
          :placeholder="t('schedule.tzSearch')"
          class="min-w-0 flex-1 bg-transparent text-body-md text-neutral-900 outline-none placeholder:text-neutral-400"
        >
      </div>
      <div class="max-h-64 overflow-y-auto overscroll-contain">
        <div v-if="!query" class="py-1">
          <div class="px-3 pb-1 pt-1.5 text-caption font-medium uppercase tracking-wider text-neutral-400">
            {{ t('schedule.tzPinned') }}
          </div>
          <button
            v-for="tz in pinnedTimezones"
            :key="tz"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-md transition-colors hover:bg-neutral-100"
            :class="modelValue === tz ? 'font-medium text-neutral-950' : 'text-neutral-700'"
            @click="pick(tz)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <UIcon v-if="modelValue === tz" name="i-heroicons-check-20-solid" class="size-3.5 shrink-0 text-neutral-950" />
              <span v-else class="size-3.5 shrink-0" />
              <span class="truncate">{{ tz === localTz ? t('schedule.tzLocal', { tz: tzCity(tz) }) : tzCity(tz) }}</span>
            </span>
            <span class="font-mono text-caption text-neutral-500 tabular-nums">{{ tzOffset(tz) }}</span>
          </button>
          <div class="my-1 h-px bg-neutral-200/80" />
        </div>
        <div v-if="filteredTimezones.length === 0 && query" class="px-3 py-6 text-center text-caption text-neutral-500">
          {{ t('schedule.noTzResults') }}
        </div>
        <button
          v-for="tz in filteredTimezones"
          :key="tz"
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-md transition-colors hover:bg-neutral-100"
          :class="modelValue === tz ? 'font-medium text-neutral-950' : 'text-neutral-700'"
          @click="pick(tz)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <UIcon v-if="modelValue === tz" name="i-heroicons-check-20-solid" class="size-3.5 shrink-0 text-neutral-950" />
            <span v-else class="size-3.5 shrink-0" />
            <span class="truncate">{{ tzCity(tz) }}</span>
          </span>
          <span class="font-mono text-caption text-neutral-500 tabular-nums">{{ tzOffset(tz) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
