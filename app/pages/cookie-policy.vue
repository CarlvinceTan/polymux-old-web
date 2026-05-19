<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'Cookie Policy',
  meta: [
    {
      name: 'description',
      content: 'How Polymux uses cookies and similar technologies for authentication, analytics, and preferences. Manage your choices.',
    },
  ],
})

const { t } = useI18n()
</script>

<template>
  <LegalDocPage
    doc-slug="cookie-policy"
    :page-title="t('legalDocs.cookies.title')"
    :page-subtitle="t('legalDocs.cookies.subtitle')"
  />
</template>
