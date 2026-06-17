<script setup lang="ts">
// Inline SVG time-series line chart with area fill, ported from the console's
// MetricChart.vue and restyled for web's light admin shell (neutral grid lines,
// blue accent line/fill). Self-contained: handles downsampling, dynamic y-axis
// scaling with hysteresis, MB↔GB unit switching, and x-axis time ticks.

interface Point { t: number, v: number }

const props = withDefaults(defineProps<{
  title: string
  unit?: string
  points: Point[]
  windowMs: number
  formatValue?: (v: number) => string
  formatTick?: (v: number) => string
  minZero?: boolean
  integer?: boolean
  maxValue?: number
  referenceValue?: number
}>(), { minZero: true, integer: false })

const HEIGHT = 104
const PAD_L = 46
const PAD_R = 8
const PAD_T = 10
const PAD_B = 18
const MAX_RENDER_POINTS = 600

// Hysteresis: shrink y-axis only when the ideal max drops to ≤ this fraction
// of the current max. Keeps the axis from flipping across step boundaries.
const SHRINK_RATIO = 0.7
// Stay in GB until raw max drops well below 1 GB, to avoid MB↔GB flipping.
const GB_TO_MB_THRESHOLD_MB = 768

const containerRef = ref<HTMLElement | null>(null)
const width = ref(320)

let ro: ResizeObserver | null = null
onMounted(() => {
  if (!containerRef.value) return
  const el = containerRef.value
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const w = Math.max(0, Math.round(e.contentRect.width))
      if (w !== width.value) width.value = w
    }
  })
  ro.observe(el)
  width.value = Math.max(0, Math.round(el.clientWidth))
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

const plotW = computed(() => Math.max(width.value - PAD_L - PAD_R, 1))
const plotH = HEIGHT - PAD_T - PAD_B

function niceScale(rawMin: number, rawMax: number, minZero: boolean, integer: boolean) {
  let lo = rawMin
  let hi = rawMax
  if (lo === hi) {
    if (lo === 0) {
      hi = integer ? 4 : 1
    }
    else {
      const pad = Math.max(Math.abs(lo) * 0.25, integer ? 1 : 0.5)
      lo -= pad
      hi += pad
    }
  }
  else {
    const pad = (hi - lo) * 0.15
    lo -= pad
    hi += pad
  }
  if (minZero && rawMin >= 0) lo = Math.max(0, lo)

  const range = Math.max(hi - lo, 1e-9)
  const rough = range / 4
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  let step: number
  if (norm < 1.5) step = 1 * mag
  else if (norm < 3) step = 2 * mag
  else if (norm < 7) step = 5 * mag
  else step = 10 * mag
  if (integer) step = Math.max(1, Math.round(step))

  const niceMin = Math.floor(lo / step) * step
  const niceMax = Math.ceil(hi / step) * step
  return { min: niceMin, max: niceMax, step }
}

// fixedScale pins the y-axis to [0, cap] and picks the largest "nice" step that
// divides cap evenly into 4–8 intervals. Falls back to cap/4 when none fit.
function fixedScale(cap: number, integer: boolean) {
  if (!Number.isFinite(cap) || cap <= 0) {
    return { min: 0, max: 1, step: 0.25 }
  }
  const coeffs = integer ? [1, 2, 4, 5] : [1, 2, 2.5, 4, 5]
  const candidates: number[] = []
  for (let mag = -3; mag <= 6; mag++) {
    const m = Math.pow(10, mag)
    for (const c of coeffs) candidates.push(c * m)
  }
  candidates.sort((a, b) => b - a)
  for (const step of candidates) {
    if (integer && Math.abs(step - Math.round(step)) > 1e-9) continue
    if (integer && step < 1) continue
    const ticks = cap / step
    if (ticks < 3.99 || ticks > 6.01) continue
    if (Math.abs(ticks - Math.round(ticks)) > 1e-9) continue
    return { min: 0, max: cap, step }
  }
  return { min: 0, max: cap, step: cap / 4 }
}

function downsample(pts: Point[], target: number): Point[] {
  if (pts.length <= target) return pts
  const bucket = Math.ceil(pts.length / target)
  const out: Point[] = []
  for (let i = 0; i < pts.length; i += bucket) {
    const end = Math.min(i + bucket, pts.length)
    let sum = 0
    for (let j = i; j < end; j++) sum += pts[j]!.v
    out.push({ t: pts[i]!.t, v: sum / (end - i) })
  }
  return out
}

const visiblePoints = computed<Point[]>(() => {
  const pts = props.points
  if (!pts.length) return []
  const tNow = pts[pts.length - 1]!.t
  const tStart = props.windowMs > 0 ? tNow - props.windowMs : pts[0]!.t
  const filtered = pts.filter(p => p.t >= tStart)
  return downsample(filtered, MAX_RENDER_POINTS)
})

const dataMinMax = computed(() => {
  const pts = visiblePoints.value
  if (!pts.length) return { lo: 0, hi: 0 }
  let lo = Infinity
  let hi = -Infinity
  for (const p of pts) {
    if (p.v < lo) lo = p.v
    if (p.v > hi) hi = p.v
  }
  return { lo, hi }
})

const useGBState = ref(false)
watch(
  () => [props.unit, dataMinMax.value.hi, props.referenceValue] as const,
  ([unit, hi, refVal]) => {
    if (unit !== 'MB') {
      useGBState.value = false
      return
    }
    if (refVal != null && refVal >= 1024) {
      useGBState.value = true
      return
    }
    if (!useGBState.value && hi >= 1024) useGBState.value = true
    else if (useGBState.value && hi < GB_TO_MB_THRESHOLD_MB) useGBState.value = false
  },
  { immediate: true },
)
const useGB = computed(() => useGBState.value)
const valueScale = computed(() => (useGB.value ? 1 / 1024 : 1))
const displayUnit = computed(() => (useGB.value ? 'GB' : props.unit))

const idealYScale = computed<{ yMin: number, yMax: number, step: number } | null>(() => {
  const pts = visiblePoints.value
  if (!pts.length) return null
  const vs = valueScale.value
  const tickInteger = props.integer && !useGB.value
  if (props.maxValue != null && props.maxValue > 0) {
    const ns = fixedScale(props.maxValue * vs, tickInteger)
    return { yMin: ns.min, yMax: ns.max, step: ns.step }
  }
  const lo = dataMinMax.value.lo * vs
  const hi = dataMinMax.value.hi * vs
  const ns = niceScale(lo, hi, props.minZero, tickInteger)
  return { yMin: ns.min, yMax: ns.max, step: ns.step }
})

const stickyYScale = ref<{ yMin: number, yMax: number, step: number } | null>(null)
watch(
  [idealYScale, useGB, () => props.windowMs, () => props.maxValue],
  ([ideal, gb], oldValues) => {
    if (ideal == null) {
      stickyYScale.value = null
      return
    }
    const cur = stickyYScale.value
    const oldGB = oldValues?.[1]
    const oldWindow = oldValues?.[2]
    const oldCap = oldValues?.[3]
    const reset
      = !cur
        || oldGB !== gb
        || oldWindow !== props.windowMs
        || oldCap !== props.maxValue
    if (reset) {
      stickyYScale.value = { ...ideal }
      return
    }
    if (ideal.yMax > cur.yMax) {
      stickyYScale.value = { ...ideal }
      return
    }
    if (ideal.yMax <= cur.yMax * SHRINK_RATIO) {
      stickyYScale.value = { ...ideal }
    }
  },
  { immediate: true },
)

const scale = computed(() => {
  const pts = visiblePoints.value
  const fallbackNow = Date.now()
  const tNow = pts.length ? pts[pts.length - 1]!.t : fallbackNow
  const tStart
    = props.windowMs > 0
      ? tNow - props.windowMs
      : pts.length
        ? pts[0]!.t
        : fallbackNow - 60_000
  const sticky = stickyYScale.value
  if (!sticky) {
    return { yMin: 0, yMax: 1, step: 0.25, tStart, tNow }
  }
  return { yMin: sticky.yMin, yMax: sticky.yMax, step: sticky.step, tStart, tNow }
})

function xFor(t: number): number {
  const { tStart, tNow } = scale.value
  const denom = tNow - tStart || 1
  return PAD_L + ((t - tStart) / denom) * plotW.value
}
function yFor(v: number): number {
  const { yMin, yMax } = scale.value
  const denom = yMax - yMin || 1
  return PAD_T + (1 - (v - yMin) / denom) * plotH
}

const path = computed(() => {
  const pts = visiblePoints.value
  if (!pts.length) return ''
  const vs = valueScale.value
  let d = ''
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    d += (i === 0 ? 'M' : 'L') + xFor(p.t).toFixed(1) + ',' + yFor(p.v * vs).toFixed(1) + ' '
  }
  return d
})

const areaPath = computed(() => {
  const pts = visiblePoints.value
  if (!pts.length) return ''
  const vs = valueScale.value
  const baselineY = HEIGHT - PAD_B
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  let d = `M${xFor(first.t).toFixed(1)},${baselineY.toFixed(1)} `
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    d += `L${xFor(p.t).toFixed(1)},${yFor(p.v * vs).toFixed(1)} `
  }
  d += `L${xFor(last.t).toFixed(1)},${baselineY.toFixed(1)} Z`
  return d
})

const yTicks = computed<number[]>(() => {
  const { yMin, yMax, step } = scale.value
  const out: number[] = []
  for (let v = yMin; v <= yMax + step * 1e-6; v += step) {
    out.push(v)
    if (out.length > 6) break
  }
  return out
})

const TIME_STEPS_MS = [
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  60 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000,
  24 * 60 * 60_000,
]

function niceTimeStep(spanMs: number, targetTicks: number): number {
  const rough = spanMs / Math.max(targetTicks, 1)
  for (const c of TIME_STEPS_MS) if (c >= rough) return c
  return TIME_STEPS_MS[TIME_STEPS_MS.length - 1]!
}

function fmtTimeDelta(deltaMs: number): string {
  if (deltaMs <= 0) return 'now'
  const sec = deltaMs / 1000
  if (sec < 60) return `-${Math.round(sec)}s`
  const min = sec / 60
  if (min < 60) {
    return Number.isInteger(min) ? `-${min}m` : `-${min.toFixed(1)}m`
  }
  const hr = min / 60
  return Number.isInteger(hr) ? `-${hr}h` : `-${hr.toFixed(1)}h`
}

const xTicks = computed<{ t: number, label: string }[]>(() => {
  const { tStart, tNow } = scale.value
  const span = tNow - tStart
  if (span <= 0) return []
  const targetTicks = Math.max(3, Math.min(6, Math.floor(plotW.value / 70)))
  const step = niceTimeStep(span, targetTicks)
  const out: { t: number, label: string }[] = []
  for (let t = tNow; t >= tStart - 1; t -= step) {
    out.push({ t, label: fmtTimeDelta(tNow - t) })
    if (out.length > 12) break
  }
  return out
})

function trimZeros(s: string): string {
  return s.indexOf('.') === -1 ? s : s.replace(/\.?0+$/, '')
}
function formatNum(v: number): string {
  if (useGB.value) {
    if (v === 0) return '0'
    if (Math.abs(v) >= 100) return v.toFixed(0)
    return trimZeros(v.toFixed(1))
  }
  if (props.integer) return Math.round(v).toString()
  if (v === 0) return '0'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  return trimZeros(v.toFixed(1))
}

const fmt = (v: number) => {
  if (props.formatValue) return props.formatValue(v)
  return formatNum(v * valueScale.value)
}
const fmtTick = (v: number) => {
  if (props.formatTick) return props.formatTick(v)
  const numStr = formatNum(v)
  const u = displayUnit.value
  if (!u || u.includes('/')) return numStr
  if (u === '%') return `${numStr}%`
  return `${numStr} ${u}`
}

const lastValue = computed(() => {
  const pts = props.points
  return pts.length ? pts[pts.length - 1]!.v : null
})
</script>

<template>
  <div class="flex flex-col rounded-xl border border-neutral-200 bg-white">
    <header class="flex shrink-0 items-baseline justify-between border-b border-neutral-100 px-3 py-2">
      <span class="truncate text-label-md font-medium uppercase tracking-wide text-neutral-400">
        {{ title }}
      </span>
      <span class="shrink-0 font-mono text-body-md text-neutral-950">
        <template v-if="lastValue !== null">
          {{ fmt(lastValue) }}<template v-if="referenceValue != null"><span class="mx-1 text-neutral-300">/</span>{{ fmt(referenceValue) }}</template><span
            v-if="displayUnit"
            class="ml-0.5 text-neutral-400"
          >{{ displayUnit }}</span>
        </template>
        <template v-else>—</template>
      </span>
    </header>
    <div ref="containerRef" class="px-1 pb-0 pt-1">
      <svg
        v-if="width > 0"
        :width="width"
        :height="HEIGHT"
        class="block"
      >
        <g>
          <line
            v-for="(t, i) in yTicks"
            :key="`yt-${i}`"
            :x1="PAD_L"
            :x2="width - PAD_R"
            :y1="yFor(t)"
            :y2="yFor(t)"
            stroke="#f1f1f3"
            stroke-width="1"
          />
          <text
            v-for="(t, i) in yTicks"
            :key="`yl-${i}`"
            :x="PAD_L - 5"
            :y="yFor(t) + 3"
            font-size="9"
            text-anchor="end"
            fill="#a3a3a3"
            font-family="ui-monospace, monospace"
          >
            {{ fmtTick(t) }}
          </text>
        </g>
        <line
          :x1="PAD_L"
          :x2="width - PAD_R"
          :y1="HEIGHT - PAD_B"
          :y2="HEIGHT - PAD_B"
          stroke="#e5e5e5"
          stroke-width="1"
        />
        <path
          v-if="areaPath"
          :d="areaPath"
          fill="#2563eb"
          fill-opacity="0.10"
          stroke="none"
        />
        <path
          v-if="path"
          :d="path"
          fill="none"
          stroke="#2563eb"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <g v-if="lastValue !== null">
          <text
            v-for="(tick, i) in xTicks"
            :key="`xl-${i}`"
            :x="xFor(tick.t)"
            :y="HEIGHT - 5"
            font-size="9"
            :text-anchor="i === 0 ? 'end' : (i === xTicks.length - 1 ? 'start' : 'middle')"
            fill="#a3a3a3"
            font-family="ui-monospace, monospace"
          >
            {{ tick.label }}
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>
