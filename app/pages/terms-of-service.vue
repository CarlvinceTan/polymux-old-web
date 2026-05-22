<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'Terms of Service',
  meta: [
    {
      name: 'description',
      content: 'Terms of service governing your use of Polymux. Acceptable use, billing, account termination, and limitations of liability.',
    },
  ],
})

const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="terms-of-service"
    :page-title="t('legalDocs.terms.title')"
    :page-subtitle="t('legalDocs.terms.subtitle')"
  />
</template>
