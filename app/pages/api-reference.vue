<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'API Reference',
  meta: [
    {
      name: 'description',
      content: 'Polymux REST API reference. Endpoints for agents, workflows, sessions, vault, and storage. Authentication, examples, and error codes.',
    },
  ],
})

const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="api-reference"
    :page-title="t('legalDocs.apiReference.title')"
    :page-subtitle="t('legalDocs.apiReference.subtitle')"
  />
</template>
