<script setup lang="ts">
const headerTabs = {
  Profile: '/config/profile',
  Settings: '/config/settings',
} as const satisfies Record<string, string>

/** Static demo copy for layout only */
const displayName = 'Carlvince Tan'
const email = 'carlvince.tan@example.com'

const planLabel = 'Free plan'
const usedRequests = 4700
const limitRequests = 10_000

const usagePercent = computed(() =>
  Math.min(100, Math.round((usedRequests / limitRequests) * 100)),
)

const initials = computed(() => {
  const name = displayName.trim() || 'U'
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
})

function formatCount(n: number) {
  return n.toLocaleString()
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div
          class="mx-auto flex w-full max-w-2xl min-h-0 min-w-0 flex-1 flex-col gap-6 p-4 sm:p-5 lg:gap-8"
        >
          <!-- Profile row -->
          <section
            class="flex flex-col gap-4 rounded-lg bg-white p-4 ghost-panel sm:flex-row sm:items-center sm:gap-5 sm:p-5"
          >
            <div class="flex min-w-0 flex-1 items-center gap-4">
              <div
                class="btn-gradient flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ring-1 ring-neutral-200/80 sm:size-16 sm:text-xl"
              >
                {{ initials }}
              </div>
              <div class="min-w-0 flex-1 space-y-0.5">
                <h2 class="truncate text-lg font-semibold text-neutral-950">
                  {{ displayName }}
                </h2>
                <p class="break-all text-body-md text-neutral-500">
                  {{ email }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="w-full shrink-0 rounded-md bg-neutral-950 px-4 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:w-auto"
            >
              Edit profile
            </button>
          </section>

          <!-- Plan & usage -->
          <section class="min-w-0">
            <h2 class="mb-3 text-body-md font-semibold tracking-tight text-neutral-950">
              Plan &amp; usage
            </h2>
            <div
              class="space-y-5 rounded-lg bg-white p-4 ghost-panel sm:p-5"
            >
              <div
                class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div class="min-w-0 flex-1 space-y-1">
                  <p class="text-label-md font-medium text-neutral-600">
                    Current plan
                  </p>
                  <p class="text-body-md font-medium text-neutral-950">
                    {{ planLabel }}
                  </p>
                </div>
                <div
                  class="flex w-full shrink-0 justify-end sm:w-auto"
                >
                  <button
                    type="button"
                    class="rounded-md bg-neutral-950 px-3 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                  >
                    Upgrade
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <div
                  class="flex items-baseline justify-between gap-3 text-label-md"
                >
                  <span class="font-medium text-neutral-600">Request usage</span>
                  <span
                    class="shrink-0 font-semibold tabular-nums text-neutral-950"
                  >
                    {{ usagePercent }}%
                  </span>
                </div>
                <div
                  class="h-2.5 overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  :aria-valuenow="usagePercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`Request usage ${usagePercent} percent`"
                >
                  <div
                    class="h-full rounded-full bg-neutral-950 transition-[width] duration-300 ease-out"
                    :style="{ width: `${usagePercent}%` }"
                  />
                </div>
                <p class="text-label-md text-neutral-500">
                  {{ formatCount(usedRequests) }} of
                  {{ formatCount(limitRequests) }} requests used this period
                </p>
              </div>
            </div>
          </section>

          <!-- Account -->
          <SettingsSection title="Account">
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-credit-card-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Payment</template>
              <template #trailing>Manage</template>
            </SettingsSectionRow>
          </SettingsSection>

          <button
            type="button"
            class="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-body-md font-medium text-error-700 transition-colors ghost-panel hover:bg-error-50"
          >
            <UIcon
              name="i-heroicons-arrow-right-start-on-rectangle-20-solid"
              class="size-4 shrink-0"
            />
            Log out
          </button>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
