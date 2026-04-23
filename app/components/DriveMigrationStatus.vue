<script setup lang="ts">
import { useI18n } from '#imports'

interface MigrationError {
  path: string
  reason: string
}

type MigrationDirection =
  | 'supabase-to-drive'
  | 'drive-to-supabase'
  | 'supabase-to-local'
  | 'drive-to-local'
  | 'local-to-supabase'
  | 'local-to-drive'

interface MigrationState {
  status: 'idle' | 'running' | 'done' | 'failed'
  direction?: MigrationDirection
  totalMigrated: number
  totalSkipped: number
  remaining: number | null
  errors: MigrationError[]
}

const props = defineProps<{
  state: MigrationState
}>()

const { t } = useI18n()

const copyKeys: Record<MigrationDirection, { running: string; done: string; failed: string }> = {
  'supabase-to-drive': {
    running: 'integrations.driveMigrating',
    done: 'integrations.driveMigrateDone',
    failed: 'integrations.driveMigrateFailed',
  },
  'drive-to-supabase': {
    running: 'integrations.driveImporting',
    done: 'integrations.driveImportDone',
    failed: 'integrations.driveImportFailed',
  },
  'supabase-to-local': {
    running: 'integrations.localMigrating',
    done: 'integrations.localMigrateDone',
    failed: 'integrations.localMigrateFailed',
  },
  'drive-to-local': {
    running: 'integrations.localMigrating',
    done: 'integrations.localMigrateDone',
    failed: 'integrations.localMigrateFailed',
  },
  'local-to-supabase': {
    running: 'integrations.localExporting',
    done: 'integrations.localExportDone',
    failed: 'integrations.localExportFailed',
  },
  'local-to-drive': {
    running: 'integrations.localExporting',
    done: 'integrations.localExportDone',
    failed: 'integrations.localExportFailed',
  },
}

function keyFor(kind: 'running' | 'done' | 'failed'): string {
  const dir = props.state.direction ?? 'supabase-to-drive'
  return copyKeys[dir][kind]
}

const runningKey = computed(() => keyFor('running'))
const doneKey = computed(() => keyFor('done'))
const failedKey = computed(() => keyFor('failed'))
</script>

<template>
  <div
    v-if="state.status !== 'idle'"
    class="flex items-start gap-3 rounded-xl border bg-white p-4"
    :class="{
      'border-neutral-300': state.status === 'running',
      'border-green-300 bg-green-50': state.status === 'done',
      'border-error-300 bg-error-50': state.status === 'failed',
    }"
  >
    <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-google-drive-tint text-google-drive">
      <svg
        v-if="state.status === 'running'"
        class="size-3.5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <svg
        v-else-if="state.status === 'done'"
        class="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <svg
        v-else
        class="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-body-md font-medium text-neutral-950">
        {{
          state.status === 'running'
            ? t(runningKey)
            : state.status === 'done'
              ? t(doneKey)
              : t(failedKey)
        }}
      </p>
      <p v-if="state.status === 'running'" class="mt-1 text-label-md text-neutral-500">
        {{
          t('integrations.driveMigrateProgress', {
            migrated: state.totalMigrated,
            remaining: state.remaining ?? '—',
          })
        }}
      </p>
      <p v-else-if="state.errors.length" class="mt-1 text-label-md text-neutral-500">
        {{ t('integrations.driveMigrateSomeFailed', { count: state.errors.length }) }}
      </p>
    </div>
  </div>
</template>
