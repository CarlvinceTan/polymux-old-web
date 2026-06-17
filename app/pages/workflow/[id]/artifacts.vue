<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const sessionId = inject<Ref<string>>('workflow-id')!
const { artifacts, removeArtifact, downloadArtifact, promote, getDownloadUrl } = useArtifacts(sessionId)

const { t } = useI18n()
const toast = useAppToast()
const route = useRoute()

const selectedArtifact = ref<SandboxArtifact | null>(null)

// Deeplink target from polymux:// chips in agent replies. The artifact list
// loads asynchronously, so we watch both the query and the list and pick
// the first moment we see a match. Cleared after open so navigating back
// to the gallery doesn't keep re-opening.
const pendingArtifactId = ref<string | null>(null)

function readArtifactQuery(): string | null {
  const raw = route.query.artifact
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value ? value : null
}

watch(
  () => route.query.artifact,
  () => {
    pendingArtifactId.value = readArtifactQuery()
  },
  { immediate: true },
)

watch(
  [artifacts, pendingArtifactId],
  ([list, id]) => {
    if (!id) return
    const match = list.find(a => a.id === id)
    if (!match) return
    selectedArtifact.value = match
    pendingArtifactId.value = null
  },
  { immediate: true },
)

watch(
  artifacts,
  (list) => {
    const selected = selectedArtifact.value
    if (!selected) return
    const latest = list.find(a => a.id === selected.id)
    selectedArtifact.value = latest ?? null
  },
)

const promoteOpen = ref(false)
const promoteTarget = ref<SandboxArtifact | null>(null)
const promoteModalRef = ref<{ fail: (message: string) => void, reset: () => void } | null>(null)

function onOpen(artifact: SandboxArtifact) {
  selectedArtifact.value = artifact
}

function onClose() {
  selectedArtifact.value = null
}

async function onDownload(artifact: SandboxArtifact) {
  const ok = await downloadArtifact(artifact)
  if (!ok) toast.show(t('artifacts.downloadError'), 'error', 4000)
}

function onSave(artifact: SandboxArtifact) {
  promoteTarget.value = artifact
  promoteOpen.value = true
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  }
  return e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? fallback
}

async function onPromoteConfirm(path: string) {
  if (!promoteTarget.value) return
  try {
    await promote(promoteTarget.value.id, path)
    promoteModalRef.value?.reset()
    toast.show(t('artifacts.promoted', { path }), 'info', 3000)
    promoteOpen.value = false
    promoteTarget.value = null
  }
  catch (err) {
    console.error('[artifacts] promote failed', err)
    promoteModalRef.value?.fail(apiErrorMessage(err, t('artifacts.promoteError')))
  }
}

async function onDelete(artifact: SandboxArtifact) {
  const ok = await removeArtifact(artifact.id)
  if (!ok) {
    toast.show(t('artifacts.deleteError'), 'error', 4000)
    return
  }
  if (selectedArtifact.value?.id === artifact.id) {
    selectedArtifact.value = null
  }
}

// ---- Bulk (multi-select) actions -------------------------------------------
// Sequential to avoid the browser's "allow multiple downloads" gate and to keep
// per-item error attribution simple.
async function onBulkDownload(items: SandboxArtifact[]) {
  let failed = 0
  for (const a of items) {
    if (!(await downloadArtifact(a))) failed++
  }
  if (failed) toast.show(t('artifacts.downloadError'), 'error', 4000)
}

// "Save all" promotes each artifact to canonical storage under its own filename.
async function onBulkSave(items: SandboxArtifact[]) {
  let saved = 0
  let failed = 0
  for (const a of items) {
    try {
      await promote(a.id, a.name)
      saved++
    }
    catch (err) {
      console.error('[artifacts] bulk promote failed', err)
      failed++
    }
  }
  if (saved) toast.show(t('artifacts.bulkSaved', { count: saved }, saved), 'info', 3000)
  if (failed) toast.show(t('artifacts.promoteError'), 'error', 4000)
}

async function onBulkDelete(items: SandboxArtifact[]) {
  let failed = 0
  for (const a of items) {
    const ok = await removeArtifact(a.id)
    if (!ok) failed++
    else if (selectedArtifact.value?.id === a.id) selectedArtifact.value = null
  }
  if (failed) toast.show(t('artifacts.deleteError'), 'error', 4000)
}
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <div class="flex flex-col min-h-0 min-w-0 flex-1">
      <template v-if="selectedArtifact">
        <ArtifactDetail
          :artifact="selectedArtifact"
          :get-download-url="getDownloadUrl"
          @close="onClose"
          @download="onDownload"
          @save="onSave"
          @delete="onDelete"
        />
      </template>
      <template v-else>
        <ArtifactsGallery
          :artifacts="artifacts"
          @open="onOpen"
          @download="onDownload"
          @save="onSave"
          @delete="onDelete"
          @bulk-download="onBulkDownload"
          @bulk-save="onBulkSave"
          @bulk-delete="onBulkDelete"
        />
      </template>
    </div>

    <ArtifactPromoteModal
      ref="promoteModalRef"
      v-model:open="promoteOpen"
      :artifact="promoteTarget"
      @confirm="onPromoteConfirm"
    />
  </TabPanel>
</template>
