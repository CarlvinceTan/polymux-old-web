<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const props = defineProps<{
  artifact: SandboxArtifact
}>()

const emit = defineEmits<{
  open: [artifact: SandboxArtifact]
}>()

const { t } = useI18n()

const previewLines = computed(() => {
  if (!props.artifact.content) return ''
  return props.artifact.content.split('\n').slice(0, 6).join('\n')
})
</script>

<template>
  <button
    type="button"
    data-testid="artifact-chat-card"
    class="my-2 flex w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm ring-1 ring-neutral-950/5 transition hover:border-neutral-300 hover:shadow-md"
    @click="emit('open', artifact)"
  >
    <div class="aspect-[4/3] w-28 shrink-0 bg-neutral-50 flex items-center justify-center overflow-hidden border-r border-neutral-100">
      <img
        v-if="artifact.type === 'image' && artifact.url"
        :src="artifact.url"
        :alt="artifact.name"
        class="h-full w-full object-cover"
        loading="lazy"
      >
      <pre
        v-else-if="artifact.content"
        class="h-full w-full overflow-hidden p-2 text-[9px] leading-tight font-mono text-neutral-500 whitespace-pre-wrap break-all"
      >{{ previewLines }}</pre>
      <svg
        v-else
        class="size-7 text-neutral-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clip-rule="evenodd" />
      </svg>
    </div>
    <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-3">
      <span class="text-xs font-medium text-neutral-950 truncate">{{ artifact.name }}</span>
      <span class="text-[11px] text-neutral-500">{{ t('chat.openArtifactRef') }}</span>
    </div>
  </button>
</template>
