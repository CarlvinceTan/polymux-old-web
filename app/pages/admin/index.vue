<script setup lang="ts">
// Admin home → the review queue (the first admin surface). The host-routing
// middleware has already forwarded apex /admin hits to the admin subdomain by
// the time this runs.
definePageMeta({ layout: 'admin' })
await navigateTo('/admin/plugins', { replace: true })
</script>

<template>
  <div />
</template>
