<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useI18n()

useHead({
  title: () => t('legalDocs.terms.metaTitle'),
  meta: [
    {
      name: 'description',
      content: () => t('legalDocs.terms.metaDescription'),
    },
  ],
})
</script>

<template>
  <LegalDocPage
    doc-slug="terms-of-service"
    :page-title="t('legalDocs.terms.title')"
    :page-subtitle="t('legalDocs.terms.subtitle')"
  />
</template>
