<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/chat/useArtifacts'

const props = defineProps<{
  artifacts: readonly SandboxArtifact[]
}>()

const emit = defineEmits<{
  open: [artifact: SandboxArtifact]
  download: [artifact: SandboxArtifact]
  save: [artifact: SandboxArtifact]
  delete: [artifact: SandboxArtifact]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
    <template v-if="artifacts.length > 0">
      <div
        class="grid gap-4"
        style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))"
      >
        <ArtifactCard
          v-for="artifact in artifacts"
          :key="artifact.id"
          :artifact="artifact"
          @open="emit('open', $event)"
          @download="emit('download', $event)"
          @save="emit('save', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>
    <template v-else>
      <div class="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col items-center justify-center self-stretch py-12 text-center">
        <svg class="size-8 text-neutral-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <p class="max-w-md text-neutral-500">{{ t('artifacts.empty') }}</p>
      </div>
    </template>
  </div>
</template>
