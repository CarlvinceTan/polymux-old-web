<script setup lang="ts">
const route = useRoute()

// Deeplink target from polymux:// chips in agent replies. `path` carries
// the raw workspace path; `kind` says whether the trailing segment is a
// file (open the parent dir, highlight the file) or a folder (open the
// folder itself).
const initialPath = computed<string[]>(() => {
  const raw = route.query.path
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value) return []
  const segments = value.split('/').filter(s => s.length > 0)
  if (route.query.kind === 'folder') return segments
  return segments.slice(0, -1)
})

const highlightFileName = computed<string | undefined>(() => {
  if (route.query.kind !== 'file') return undefined
  const raw = route.query.path
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value) return undefined
  const segments = value.split('/').filter(s => s.length > 0)
  return segments[segments.length - 1]
})
</script>

<template>
  <!-- FileBrowser fills the layout's content card directly (the shell provides
       the white rounded surface) — no own panel chrome, like the schedule page. -->
  <div class="relative flex min-h-0 min-w-0 w-full flex-1 flex-col">
    <FileBrowser
      :initial-path="initialPath"
      :highlight-file-name="highlightFileName"
      class="min-h-0 min-w-0 flex-1"
    />
    <StorageProviderUsageOverlay />
  </div>
</template>
