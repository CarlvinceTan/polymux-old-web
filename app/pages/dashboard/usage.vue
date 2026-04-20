<script setup lang="ts">
const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()
const user = useSupabaseUser()

const { currentWorkspace, members, fetchMembers } = useWorkspaces()

watch(currentWorkspace, (ws) => {
  if (ws) fetchMembers(ws.id)
}, { immediate: true })

const usage = computed(() => ({
  storage: { used: 1.2, total: 5, unit: 'GB' },
  seats: { used: members.value.length, total: 10 },
  requests: { used: 847, total: 5000 },
}))

function usagePercent(used: number, total: number) {
  return Math.min(100, Math.round((used / total) * 100))
}

function usageBarColor(percent: number) {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-amber-500'
  return 'bg-neutral-950'
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader
      :tabs="headerTabs"
      :separator-before-path="dashboardNavSeparatorBeforePath"
      raw-tab-labels
    />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <GuestPlaceholder v-if="!user" />
        <div v-else class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:px-8 lg:pb-6 lg:pt-5">
          <div class="mb-6 flex flex-col gap-1 border-b border-neutral-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 class="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
                Usage
              </h1>
              <p class="mt-1 text-body-md text-neutral-500">
                Workspace consumption for the current plan
                <span v-if="currentWorkspace?.plan" class="capitalize">· {{ currentWorkspace.plan }}</span>
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-8 border-neutral-100 sm:grid-cols-3 sm:gap-6 sm:border-t sm:pt-6 xl:gap-10">
            <div
              v-for="item in [
                { label: 'Storage', used: usage.storage.used, total: usage.storage.total, unit: usage.storage.unit, icon: 'storage' },
                { label: 'Seats', used: usage.seats.used, total: usage.seats.total, unit: '', icon: 'seats' },
                { label: 'Requests', used: usage.requests.used, total: usage.requests.total, unit: '', icon: 'requests' },
              ]"
              :key="item.label"
              class="min-w-0 border-neutral-100 pb-8 sm:border-l sm:pb-0 sm:pl-6 sm:first:border-l-0 sm:first:pl-0 xl:pl-8 xl:first:pl-0"
            >
              <div class="flex items-center justify-between">
                <span class="text-label-md font-medium text-neutral-500">{{ item.label }}</span>
                <svg v-if="item.icon === 'storage'" class="size-4 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                <svg v-else-if="item.icon === 'seats'" class="size-4 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                <svg v-else class="size-4 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <p class="mt-2 text-xl font-bold tabular-nums text-neutral-950">
                {{ item.label === 'Requests' ? (item.used as number).toLocaleString() : item.used }}
                <span class="text-body-md font-normal text-neutral-400">
                  / {{ item.label === 'Requests' ? (item.total as number).toLocaleString() : item.total }}{{ item.unit ? ` ${item.unit}` : item.label === 'Seats' ? ' seats' : '' }}
                </span>
              </p>
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  class="h-full rounded-full transition-[width] duration-300 ease-out"
                  :class="usageBarColor(usagePercent(item.used as number, item.total as number))"
                  :style="{ width: usagePercent(item.used as number, item.total as number) + '%' }"
                />
              </div>
              <p class="mt-1.5 text-label-md text-neutral-400">{{ usagePercent(item.used as number, item.total as number) }}% used</p>
            </div>
          </div>

          <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
        </div>
      </TabPanel>
    </div>
  </div>
</template>