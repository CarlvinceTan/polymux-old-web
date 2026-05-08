<script setup lang="ts">
import { marked } from 'marked'

const { t } = useI18n()
const { copy, copied } = useClipboard()

const props = defineProps<{
  text: string
  showActions?: boolean
  /** Total retry versions (including the original). Hidden when 0 or 1. */
  retryCount?: number
  /** Active version index, 0-based. */
  activeRetryIndex?: number
}>()

const emit = defineEmits<{
  retry: []
  'navigate-retry': [retryIndex: number]
}>()

const renderer = new marked.Renderer()
const defaultTableRenderer = renderer.table.bind(renderer)
renderer.table = function (token) {
  return `<div class="table-scroll">${defaultTableRenderer(token)}</div>`
}

function renderMarkdown(text: string): string {
  return marked.parse(text, { renderer }) as string
}

// Show the retry navigator (arrows + counter) when there is more than one
// version to choose from. The position next to the retry icon mirrors
// design-language conventions for paginated content.
const hasRetries = computed(() => (props.retryCount ?? 0) > 1)
const activeIdx = computed(() => props.activeRetryIndex ?? ((props.retryCount ?? 1) - 1))
const canPrev = computed(() => hasRetries.value && activeIdx.value > 0)
const canNext = computed(() => hasRetries.value && activeIdx.value < (props.retryCount ?? 1) - 1)

function goPrev() {
  if (canPrev.value) emit('navigate-retry', activeIdx.value - 1)
}
function goNext() {
  if (canNext.value) emit('navigate-retry', activeIdx.value + 1)
}
</script>

<template>
  <div class="group w-full min-w-0">
    <div class="agent-prose text-sm leading-relaxed text-neutral-700" v-html="renderMarkdown(text)" />
    <div
      v-if="showActions"
      class="mt-0.5 flex items-center gap-0.5 transition-opacity duration-150"
      :class="hasRetries ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
    >
      <MessageAction :icon="copied ? 'i-heroicons-check' : 'i-heroicons-square-2-stack'" :label="t('common.copy')" @click="copy(props.text)" />
      <MessageAction icon="i-heroicons-hand-thumb-up" :label="t('chat.goodResponse')" />
      <MessageAction icon="i-heroicons-hand-thumb-down" :label="t('chat.badResponse')" />
      <MessageAction icon="i-heroicons-arrow-up-on-square" :label="t('common.share')" />
      <MessageAction icon="i-heroicons-arrow-path-20-solid" :label="t('common.retry')" @click="emit('retry')" />
      <div
        v-if="hasRetries"
        class="ml-0.5 flex items-center gap-0.5 text-[11px] leading-none text-neutral-500"
      >
        <button
          type="button"
          class="flex size-5 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          :disabled="!canPrev"
          :aria-label="t('chat.previousRetry')"
          @click="goPrev"
        >
          <UIcon name="i-heroicons-chevron-left-20-solid" class="size-3" />
        </button>
        <span class="min-w-6 px-0.5 text-center font-medium tabular-nums">
          {{ activeIdx + 1 }}/{{ retryCount }}
        </span>
        <button
          type="button"
          class="flex size-5 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          :disabled="!canNext"
          :aria-label="t('chat.nextRetry')"
          @click="goNext"
        >
          <UIcon name="i-heroicons-chevron-right-20-solid" class="size-3" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-prose :deep(p) {
  margin: 0 0 0.6em;
}
.agent-prose :deep(p:last-child) {
  margin-bottom: 0;
}
.agent-prose :deep(h1),
.agent-prose :deep(h2),
.agent-prose :deep(h3),
.agent-prose :deep(h4) {
  font-weight: 600;
  line-height: 1.3;
  margin: 1em 0 0.4em;
  color: #171717;
}
.agent-prose :deep(h1) { font-size: 1.2em; }
.agent-prose :deep(h2) { font-size: 1.1em; }
.agent-prose :deep(h3) { font-size: 1em; }
.agent-prose :deep(ul) {
  margin: 0.5em 0;
  padding-left: 1.4em;
  list-style-type: disc;
}
.agent-prose :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
  list-style-type: decimal;
}
.agent-prose :deep(ul ul) { list-style-type: circle; }
.agent-prose :deep(ul ul ul) { list-style-type: square; }
.agent-prose :deep(li) {
  margin: 0.2em 0;
}
.agent-prose :deep(code) {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 0.85em;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 0.1em 0.35em;
}
.agent-prose :deep(pre) {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.85em 1em;
  overflow-x: auto;
  margin: 0.6em 0;
}
.agent-prose :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.82em;
}
.agent-prose :deep(blockquote) {
  border-left: 3px solid #d4d4d4;
  margin: 0.5em 0;
  padding-left: 0.9em;
  color: #525252;
}
.agent-prose :deep(a) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.agent-prose :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.75em 0;
}
.agent-prose :deep(strong) { font-weight: 600; }
.agent-prose :deep(em) { font-style: italic; }

/* Tables */
.agent-prose :deep(.table-scroll) {
  overflow-x: auto;
  margin: 0.6em 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.agent-prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
  line-height: 1.45;
}
.agent-prose :deep(thead tr) {
  background: #f9fafb;
}
.agent-prose :deep(th) {
  font-weight: 600;
  color: #171717;
  text-align: left;
  padding: 0.5em 0.75em;
  border-bottom: 1.5px solid #e5e7eb;
  white-space: nowrap;
}
.agent-prose :deep(td) {
  padding: 0.45em 0.75em;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
}
.agent-prose :deep(tbody tr:last-child td) {
  border-bottom: none;
}
.agent-prose :deep(tbody tr:nth-child(even)) {
  background: #fafafa;
}
</style>
