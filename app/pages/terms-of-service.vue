<script setup lang="ts">
definePageMeta({ layout: 'landing' })
const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="terms-of-service"
    :page-title="t('legalDocs.terms.title')"
    :page-subtitle="t('legalDocs.terms.subtitle')"
  />
</template>
