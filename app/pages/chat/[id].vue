<script setup lang="ts">
const route = useRoute()
const chatId = computed(() => route.params.id as string)

function queryString(query: typeof route.query) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item))
    } else {
      search.set(key, String(value))
    }
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

const headerTabs = computed(() => {
  const base = `/chat/${chatId.value}`
  const qs = queryString(route.query)
  return {
    Create: `${base}/create${qs}`,
    Edit: `${base}/edit${qs}`,
    Visualise: `${base}/visualise${qs}`,
  } satisfies Record<string, string>
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <NuxtPage
        :key="route.fullPath"
        class="min-h-0 min-w-0 flex-1"
      />
    </div>
  </div>
</template>
