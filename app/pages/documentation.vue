<script setup lang="ts">
definePageMeta({ layout: 'landing' })
const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="documentation"
    :page-title="t('legalDocs.documentation.title')"
    :page-subtitle="t('legalDocs.documentation.subtitle')"
    :show-back="false"
  />
</template>
