<script setup lang="ts">
// Installed and Marketplace were merged into the unified Connections table
// (now at /connections). This route is kept as a query-preserving redirect so
// existing deep links (e.g. ?tag=storage from storage settings) keep working.
const route = useRoute()
await navigateTo({ path: '/connections', query: route.query }, { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
