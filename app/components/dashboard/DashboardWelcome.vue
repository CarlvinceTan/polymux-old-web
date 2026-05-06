<script setup lang="ts">
const { t } = useI18n()
const user = useSupabaseUser()
const { currentWorkspace } = useWorkspaces()
const { draft, createDraft } = useWorkflowList()

// Deferred until after mount so the SSR'd HTML matches the first client
// render. `new Date()` evaluated during setup picks up the server's clock
// and timezone — different from the browser's — and produces a hydration
// mismatch when the greeting / date-of-week disagree.
const now = ref<Date | null>(null)
onMounted(() => {
  now.value = new Date()
})

const greetingKey = computed(() => {
  const h = now.value?.getHours()
  if (h === undefined) return 'dashboard.goodMorning'
  if (h < 5) return 'dashboard.goodNight'
  if (h < 12) return 'dashboard.goodMorning'
  if (h < 17) return 'dashboard.goodAfternoon'
  if (h < 22) return 'dashboard.goodEvening'
  return 'dashboard.goodNight'
})

const displayName = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.full_name || meta?.name || user.value?.email?.split('@')[0] || '') as string
})

const firstName = computed(() => {
  const name = displayName.value
  if (!name) return ''
  return name.split(/\s+/)[0] ?? ''
})

const planLabel = computed(() => {
  const plan = currentWorkspace.value?.plan ?? 'free'
  return t(`settings.${plan}Plan`)
})

const todayLabel = computed(() =>
  now.value?.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) ?? '',
)

async function handleNewWorkflow() {
  if (!draft.value) createDraft()
  await navigateTo('/workflow/new')
}
</script>

<template>
  <section
    class="relative shrink-0 overflow-hidden rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white via-white to-neutral-50 p-5 sm:p-7"
  >
    <!-- Subtle radial accent, monochrome-safe -->
    <div
      class="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(10,10,10,0.06),transparent_60%)]"
      aria-hidden="true"
    />
    <!-- Tiny grid texture on the right edge for subtle character -->
    <div
      class="pointer-events-none absolute right-0 top-0 h-full w-56 opacity-[0.035]"
      style="background-image: linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px); background-size: 22px 22px;"
      aria-hidden="true"
    />

    <div class="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          {{ todayLabel }}
        </p>
        <h1 class="mt-2 leading-tight text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
          {{ t(greetingKey) }}<span v-if="firstName">, {{ firstName }}</span>
        </h1>
        <div class="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700"
          >
            <span class="size-1.5 rounded-full bg-neutral-900" aria-hidden="true" />
            {{ currentWorkspace?.name ?? t('nav.mainSidebar') }}
          </span>
          <span
            class="inline-flex items-center rounded-full bg-neutral-950 px-2.5 py-1 text-xs font-medium text-white"
          >
            {{ planLabel }}
          </span>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <NuxtLink
          to="/integrations/marketplace"
          class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <UIcon name="i-heroicons-squares-plus-20-solid" class="size-4" />
          {{ t('dashboard.exploreTemplates') }}
        </NuxtLink>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          @click="handleNewWorkflow"
        >
          <UIcon name="i-heroicons-plus-20-solid" class="size-4" />
          {{ t('dashboard.newWorkflow') }}
        </button>
      </div>
    </div>
  </section>
</template>
