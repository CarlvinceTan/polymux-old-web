<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useI18n()

useHead({
  title: () => t('legalDocs.about.metaTitle'),
  meta: [
    {
      name: 'description',
      content: () => t('legalDocs.about.metaDescription'),
    },
  ],
})
</script>

<template>
  <LegalDocPage
    doc-slug="about-us"
    :page-title="t('legalDocs.about.title')"
    :page-subtitle="t('legalDocs.about.subtitle')"
  />
</template>
