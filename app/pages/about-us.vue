<script setup lang="ts">
definePageMeta({ layout: 'landing' })
const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="about-us"
    :page-title="t('legalDocs.about.title')"
    :page-subtitle="t('legalDocs.about.subtitle')"
  />
</template>
