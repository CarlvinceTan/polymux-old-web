<template>
  <div class="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
    <UPage
      class="min-h-0 flex-1 overflow-hidden"
      :ui="{
        root:
          'flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden lg:!grid lg:!h-full lg:!min-h-0 lg:!grid-cols-[auto_minmax(0,1fr)] lg:!grid-rows-1 lg:!gap-0',
        left:
          'w-full shrink-0 overflow-hidden lg:!col-auto lg:h-full lg:min-h-0',
        center:
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F9F9F9] lg:!col-auto lg:h-full',
      }"
    >
      <template #left>
        <SidePanel />
      </template>

      <slot />
    </UPage>

    <ToastContainer />
    <NotificationsToast />
    <MigrationProgressToast />
  </div>
</template>
