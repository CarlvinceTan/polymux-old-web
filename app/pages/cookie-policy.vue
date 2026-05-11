<script setup lang="ts">
definePageMeta({ layout: 'landing' })
const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="cookie-policy"
    :page-title="t('legalDocs.cookies.title')"
    :page-subtitle="t('legalDocs.cookies.subtitle')"
  />
</template>
