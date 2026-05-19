<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'Documentation',
  meta: [
    {
      name: 'description',
      content: 'Polymux documentation: install, configure, build agents, and run multi-agent workflows. Guides, references, and recipes.',
    },
  ],
})

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
