<script setup lang="ts">
const { t } = useI18n()

useHead(() => ({
  title: t('workspaceMenu.modalTitle'),
}))
</script>

<template>
  <WorkspaceSettingsModal inline />
</template>
