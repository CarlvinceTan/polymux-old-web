<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'Privacy Policy',
  meta: [
    {
      name: 'description',
      content: 'How Polymux collects, stores, and uses personal information. Your rights, data retention, and contact details.',
    },
  ],
})

const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="privacy-policy"
    :page-title="t('legalDocs.privacy.title')"
    :page-subtitle="t('legalDocs.privacy.subtitle')"
  />
</template>
