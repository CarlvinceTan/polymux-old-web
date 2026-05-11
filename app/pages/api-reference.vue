<script setup lang="ts">
definePageMeta({ layout: 'landing' })
const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="api-reference"
    :page-title="t('legalDocs.apiReference.title')"
    :page-subtitle="t('legalDocs.apiReference.subtitle')"
  />
</template>
