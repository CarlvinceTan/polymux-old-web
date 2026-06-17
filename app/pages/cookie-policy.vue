<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useI18n()

useHead({
  title: () => t('legalDocs.cookies.metaTitle'),
  meta: [
    {
      name: 'description',
      content: () => t('legalDocs.cookies.metaDescription'),
    },
  ],
})
</script>

<template>
  <LegalDocPage
    doc-slug="cookie-policy"
    :page-title="t('legalDocs.cookies.title')"
    :page-subtitle="t('legalDocs.cookies.subtitle')"
  />
</template>
