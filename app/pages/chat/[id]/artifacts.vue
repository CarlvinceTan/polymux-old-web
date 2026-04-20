<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/useArtifacts'

const route = useRoute()
const sessionId = computed(() => route.params.id as string)

const { sessions } = useChatSessions()
const { artifacts, removeArtifact, downloadArtifact } = useArtifacts(sessionId)

const { t } = useI18n()
const toast = useAppToast()

const selectedArtifact = ref<SandboxArtifact | null>(null)

function onOpen(artifact: SandboxArtifact) {
  selectedArtifact.value = artifact
}

function onClose() {
  selectedArtifact.value = null
}

function onDownload(artifact: SandboxArtifact) {
  downloadArtifact(artifact)
}

async function onSave(artifact: SandboxArtifact) {
  toast.show(t('artifacts.savedToStorage'), 'info', 3000)
}

function onDelete(artifact: SandboxArtifact) {
  removeArtifact(artifact.id)
  if (selectedArtifact.value?.id === artifact.id) {
    selectedArtifact.value = null
  }
}
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
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
  </TabPanel>
</template>
