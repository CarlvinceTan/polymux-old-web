<script setup lang="ts">
definePageMeta({ layout: 'landing' })
const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="privacy-policy"
    :page-title="t('legalDocs.privacy.title')"
    :page-subtitle="t('legalDocs.privacy.subtitle')"
  />
</template>
