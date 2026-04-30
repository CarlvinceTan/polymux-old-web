<script setup lang="ts">
const { t } = useI18n()

interface Template {
  id: string
  icon: string
  label: string
  description: string
  accent: string
}

const templates = computed<Template[]>(() => [
  {
    id: 'research-assistant',
    icon: 'i-heroicons-academic-cap-20-solid',
    label: t('dashboard.templateResearchLabel'),
    description: t('dashboard.templateResearchDesc'),
    accent: 'from-neutral-100 to-white',
  },
  {
    id: 'email-summarizer',
    icon: 'i-heroicons-envelope-20-solid',
    label: t('dashboard.templateEmailLabel'),
    description: t('dashboard.templateEmailDesc'),
    accent: 'from-neutral-100 to-white',
  },
  {
    id: 'daily-briefing',
    icon: 'i-heroicons-sun-20-solid',
    label: t('dashboard.templateDailyLabel'),
    description: t('dashboard.templateDailyDesc'),
    accent: 'from-neutral-100 to-white',
  },
  {
    id: 'code-reviewer',
    icon: 'i-heroicons-code-bracket-20-solid',
    label: t('dashboard.templateCodeLabel'),
    description: t('dashboard.templateCodeDesc'),
    accent: 'from-neutral-100 to-white',
  },
])
</script>

<template>
  <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
    <header class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-neutral-950">
          {{ t('dashboard.templatesTitle') }}
        </h2>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{ t('dashboard.templatesDesc') }}
        </p>
      </div>
      <NuxtLink
        to="/integrations/marketplace"
        class="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        {{ t('dashboard.browseMarketplace') }}
        <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3" />
      </NuxtLink>
    </header>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <NuxtLink
        v-for="tpl in templates"
        :key="tpl.id"
        :to="`/integrations/marketplace?item=${tpl.id}`"
        class="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-200/70 bg-gradient-to-br p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
        :class="tpl.accent"
      >
        <div class="flex size-9 items-center justify-center rounded-lg bg-white text-neutral-900 ring-1 ring-neutral-200 transition-colors group-hover:bg-neutral-950 group-hover:text-white group-hover:ring-neutral-950">
          <UIcon :name="tpl.icon" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-neutral-950">
            {{ tpl.label }}
          </p>
          <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">
            {{ tpl.description }}
          </p>
        </div>
        <UIcon
          name="i-heroicons-arrow-up-right-20-solid"
          class="absolute right-3 top-3 size-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </NuxtLink>
    </div>
  </section>
</template>
