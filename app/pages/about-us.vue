<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'About Us',
  meta: [
    {
      name: 'description',
      content: 'Polymux builds the orchestration layer for AI agents on the live web. Learn about our mission, team, and roadmap.',
    },
  ],
})

const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="about-us"
    :page-title="t('legalDocs.about.title')"
    :page-subtitle="t('legalDocs.about.subtitle')"
  />
</template>
