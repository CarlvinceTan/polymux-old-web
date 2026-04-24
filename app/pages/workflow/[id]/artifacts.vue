<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/useArtifacts'

const sessionId = inject<Ref<string>>('chat-session-id')!
const { artifacts, removeArtifact, downloadArtifact, promote } = useArtifacts(sessionId)

const { t } = useI18n()
const toast = useAppToast()

const selectedArtifact = ref<SandboxArtifact | null>(null)

const promoteOpen = ref(false)
const promoteTarget = ref<SandboxArtifact | null>(null)
const promoteModalRef = ref<{ fail: (message: string) => void, reset: () => void } | null>(null)

function onOpen(artifact: SandboxArtifact) {
  selectedArtifact.value = artifact
}

function onClose() {
  selectedArtifact.value = null
}

function onDownload(artifact: SandboxArtifact) {
  void downloadArtifact(artifact)
}

function onSave(artifact: SandboxArtifact) {
  promoteTarget.value = artifact
  promoteOpen.value = true
}

async function onPromoteConfirm(path: string) {
  if (!promoteTarget.value) return
  try {
    await promote(promoteTarget.value.id, path)
    toast.show(t('artifacts.promoted', { path }), 'info', 3000)
    promoteOpen.value = false
    promoteTarget.value = null
  }
  catch (err) {
    console.error('[artifacts] promote failed', err)
    promoteModalRef.value?.fail(t('artifacts.promoteError'))
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
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <div class="flex flex-col min-h-0 min-w-0 flex-1">
      <template v-if="selectedArtifact">
        <ArtifactDetail
          :artifact="selectedArtifact"
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
