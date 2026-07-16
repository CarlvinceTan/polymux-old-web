<script setup lang="ts">
const { t } = useI18n()
const { isCollapsed, toggle } = useSidebar()
</script>

<template>
  <div class="relative flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
    <MaintenanceBanner />
    <UPage
      class="min-h-0 flex-1 overflow-hidden"
      :ui="{
        root:
          'flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden lg:!grid lg:!h-full lg:!min-h-0 lg:!grid-cols-[auto_minmax(0,1fr)] lg:!grid-rows-1 lg:!gap-0',
        left:
          'w-full shrink-0 overflow-hidden lg:!col-auto lg:h-full lg:min-h-0',
        center:
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100 lg:!col-auto lg:h-full',
      }"
    >
      <template #left>
        <div
          class="sidebar-slot h-full overflow-hidden"
          :class="{ 'is-collapsed': isCollapsed }"
        >
          <!-- Fixed-width rail (desktop): width comes from --sidebar-w, a constant set
               in main.css (also used by the collapse CSS). -->
          <div class="sidebar-rail h-full lg:w-[var(--sidebar-w)]">
            <Sidebar />
          </div>
        </div>
      </template>

      <!-- Content card: white surface on the sidebar-colored background, with a
           thin equal gap on all four sides (incl. left, between it and the
           sidebar). PostHog-style. -->
      <div
        class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-neutral-200 bg-white lg:mb-1 lg:ml-1 lg:mr-1 lg:mt-1 lg:rounded-lg lg:border"
      >
        <!-- Expand control: when the sidebar is collapsed there's no in-rail
             toggle, so a hamburger sits in the card's top-left corner to bring
             the sidebar back. Content insets a touch while collapsed so page
             headers clear it. Desktop only (matches the collapse CSS). -->
        <Transition
          enter-active-class="transition duration-200 ease-out"
          leave-active-class="transition duration-150 ease-in"
          enter-from-class="-translate-x-1 opacity-0"
          leave-to-class="-translate-x-1 opacity-0"
        >
          <button
            v-if="isCollapsed"
            type="button"
            class="absolute left-2 top-2 z-30 hidden size-[28px] items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:flex"
            :aria-label="t('nav.toggleSidebar')"
            @click="toggle"
          >
            <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </Transition>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <slot />
        </div>
      </div>
    </UPage>

    <AppToastContainer />
    <UpgradePlanModalHost />
    <NotificationsToast />
    <MigrationProgressToast />
  </div>
</template>
