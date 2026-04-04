<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string

await navigateTo({
  path: `/chat/${id}/create`,
  query: route.query,
  replace: true,
})
</script>

<template>
  <div />
</template>
