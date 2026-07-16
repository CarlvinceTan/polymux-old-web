<script setup lang="ts">
const { t } = useI18n()

useHead(() => ({
  title: t('settings.title'),
}))
</script>

<template>
  <UserSettingsModal inline />
</template>
