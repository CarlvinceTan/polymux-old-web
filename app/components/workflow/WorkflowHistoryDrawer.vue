<script setup lang="ts">
import type { WorkflowVersion } from '~/composables/workflows/useWorkflows'

export interface LiveHistoryEntry {
  // 'agent-draft' = orchestrator's in-progress workflow tree (no saved workflow yet)
  // 'user-unsaved' = saved workflow with local edits the user hasn't persisted
  kind: 'agent-draft' | 'user-unsaved'
}

const props = defineProps<{
  open: boolean
  versions: WorkflowVersion[]
  currentVersionId?: string | null
  selectedVersionId?: string | null
  liveEntry?: LiveHistoryEntry | null
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [versionId: string | null]
  reset: [versionId: string]
}>()

const { t } = useI18n()
const { relativeOrAbsoluteTime } = useRelativeTime()
const supaUser = useSupabaseUser()
const { members } = useWorkspaces()

function onRowClick(v: WorkflowVersion) {
  if (props.selectedVersionId === v.id) emit('select', null)
  else emit('select', v.id)
}

const liveTitle = computed(() => {
  if (!props.liveEntry) return ''
  // Both agent-drafts and user-unsaved local edits read as "Draft" in the
  // history drawer — the distinction is preserved in code (kind) for future
  // styling/affordance differences, but the label itself is unified.
  return t('workflow.draftBadge')
})

// "Currently viewed" = the row whose state the canvas is showing right now.
// Priority: explicit version selection > live draft > latest saved version.
// Drives the "Viewing" chip on that row; row backgrounds stay flat.
const liveSelected = computed(() => !!props.liveEntry && !props.selectedVersionId)

function isViewedVersion(v: WorkflowVersion): boolean {
  if (props.selectedVersionId) return v.id === props.selectedVersionId
  if (props.liveEntry) return false
  return v.id === props.currentVersionId
}

function userDisplayName(userId: string): string {
  if (!userId) return ''
  const m = members.value.find(x => x.user_id === userId)
  if (m?.display_name) return m.display_name
  if (m?.email) return m.email.split('@')[0] ?? ''
  if (userId === supaUser.value?.id) {
    const meta = supaUser.value?.user_metadata
    return (meta?.full_name as string | undefined)
      || (meta?.name as string | undefined)
      || t('workflow.savedByYou')
  }
  return ''
}

function savedByLabel(v: WorkflowVersion): string {
  if (v.source === 'agent') return t('workflow.savedByAgent')
  return userDisplayName(v.created_by) || t('workflow.savedByYou')
}

const liveSavedBy = computed(() => {
  if (props.liveEntry?.kind === 'agent-draft') return t('workflow.savedByAgent')
  return userDisplayName(supaUser.value?.id ?? '') || t('workflow.savedByYou')
})
</script>

<template>
  <InfoPanel
    :open="open"
    :title="t('workflow.historyTitle')"
    @close="emit('close')"
  >
    <div v-if="loading" class="flex flex-1 items-center justify-center text-xs text-neutral-400">
      {{ t('workflow.loadingHistory') }}
    </div>
    <div v-else-if="versions.length === 0 && !liveEntry" class="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <UIcon name="i-heroicons-clock-20-solid" class="size-8 text-neutral-300" />
      <p class="text-sm text-neutral-500">{{ t('workflow.noHistory') }}</p>
    </div>
    <ul v-else class="flex flex-col py-1">
      <li v-if="liveEntry">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-4 text-left text-[12px] transition-colors hover:bg-neutral-50"
          @click="emit('select', null)"
        >
          <!-- Draft rail: dot is intentionally disconnected from the version
               timeline below — no line segments rendered here. -->
          <span class="relative flex h-6 w-3 shrink-0 items-center justify-center">
            <span class="relative z-10 size-2 rounded-full bg-neutral-400" />
          </span>
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <span class="min-w-0 truncate text-neutral-700">{{ liveTitle }}</span>
            <span
              v-if="liveSelected"
              class="shrink-0 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
            >
              {{ t('workflow.viewing') }}
            </span>
          </span>
          <span class="shrink-0 text-[11px] text-neutral-400">{{ liveSavedBy }}</span>
        </button>
      </li>

      <!-- Saved-version row: the row body and reset affordance are siblings
           inside a wrapping flex strip so the reset button can be a real
           `<button>` (nested buttons are invalid HTML). The strip carries the
           hover bg + group token; the user-name span and reset icon are
           hover-swapped via group-hover/version-row. -->
      <li v-for="(v, idx) in versions" :key="v.id" class="group/version-row">
        <div class="flex w-full items-center px-4 text-[12px] transition-colors hover:bg-neutral-50">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-left text-[12px] outline-none"
            @click="onRowClick(v)"
          >
            <!-- Version rail: explicit h-6 drives row height so the connecting
                 line has enough vertical room outside the dot, and adjacent
                 rows' rails touch edge-to-edge (no button py to break them
                 apart). The line is drawn as two halves around the dot so the
                 first/last rows only render their inward-facing segment. -->
            <span class="relative flex h-6 w-3 shrink-0 items-center justify-center">
              <span
                v-if="idx > 0"
                class="absolute left-1/2 top-0 h-1/2 w-0.5 -translate-x-1/2 bg-neutral-300"
              />
              <span
                v-if="idx < versions.length - 1"
                class="absolute left-1/2 bottom-0 h-1/2 w-0.5 -translate-x-1/2 bg-neutral-300"
              />
              <span class="relative z-10 size-2 rounded-full bg-neutral-400" />
            </span>
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span class="min-w-0 truncate text-neutral-700">
                {{ relativeOrAbsoluteTime(v.created_at) }}
              </span>
              <span
                v-if="isViewedVersion(v)"
                class="shrink-0 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
              >
                {{ t('workflow.viewing') }}
              </span>
            </span>
          </button>
          <span
            class="shrink-0 pl-2 text-[11px] text-neutral-400 group-hover/version-row:hidden"
          >{{ savedByLabel(v) }}</span>
          <button
            type="button"
            class="hidden h-6 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent pl-2 text-neutral-400 outline-none transition-colors hover:text-neutral-900 group-hover/version-row:inline-flex"
            :aria-label="t('workflow.resetToVersion')"
            :title="t('workflow.resetToVersion')"
            @click="emit('reset', v.id)"
          >
            <UIcon name="i-heroicons-arrow-uturn-left-20-solid" class="size-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </InfoPanel>
</template>
