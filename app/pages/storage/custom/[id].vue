<script setup lang="ts">
const { headerTabs, customTabs } = useStorageNavTabs()
const route = useRoute()
const wiId = computed(() => String(route.params.id))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <SubNav :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />
    <TabPanel class="min-h-0 min-w-0 flex-1">
      <CustomLayoutFrame :workspace-integration-id="wiId" />
    </TabPanel>
  </div>
</template>
