<script setup lang="ts">
const { t } = useI18n()
const { draft, createDraft } = useChatSessions()

interface QuickAction {
  key: string
  icon: string
  label: string
  description: string
  to?: string
  onClick?: () => Promise<void> | void
  accent: string
}

async function handleNewWorkflow() {
  if (!draft.value) createDraft()
  await navigateTo('/workflow/new')
}

const actions = computed<QuickAction[]>(() => [
  {
    key: 'new',
    icon: 'i-heroicons-sparkles-20-solid',
    label: t('dashboard.quickActionNewWorkflow'),
    description: t('dashboard.quickActionNewWorkflowDesc'),
    accent: 'bg-neutral-950 text-white',
    onClick: handleNewWorkflow,
  },
  {
    key: 'invite',
    icon: 'i-heroicons-user-plus-20-solid',
    label: t('dashboard.quickActionInvite'),
    description: t('dashboard.quickActionInviteDesc'),
    accent: 'bg-neutral-100 text-neutral-900',
    to: '/dashboard/team',
  },
  {
    key: 'integrations',
    icon: 'i-heroicons-bolt-20-solid',
    label: t('dashboard.quickActionIntegrations'),
    description: t('dashboard.quickActionIntegrationsDesc'),
    accent: 'bg-neutral-100 text-neutral-900',
    to: '/integrations/marketplace',
  },
  {
    key: 'storage',
    icon: 'i-heroicons-folder-20-solid',
    label: t('dashboard.quickActionStorage'),
    description: t('dashboard.quickActionStorageDesc'),
    accent: 'bg-neutral-100 text-neutral-900',
    to: '/storage/main',
  },
])
</script>

<template>
  <section>
    <header class="mb-3 flex items-end justify-between">
      <div>
        <h2 class="text-sm font-semibold text-neutral-950">
          {{ t('dashboard.quickActionsTitle') }}
        </h2>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{ t('dashboard.quickActionsDesc') }}
        </p>
      </div>
    </header>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <template v-for="a in actions" :key="a.key">
        <NuxtLink
          v-if="a.to"
          :to="a.to"
          class="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
        >
          <div
            class="flex size-9 items-center justify-center rounded-lg transition-colors"
            :class="a.accent"
          >
            <UIcon :name="a.icon" class="size-4" />
          </div>
          <div>
            <p class="text-sm font-semibold text-neutral-950">{{ a.label }}</p>
            <p class="mt-0.5 text-xs leading-snug text-neutral-500">
              {{ a.description }}
            </p>
          </div>
          <UIcon
            name="i-heroicons-arrow-up-right-20-solid"
            class="absolute right-3 top-3 size-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </NuxtLink>
        <button
          v-else
          type="button"
          class="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
          @click="a.onClick && a.onClick()"
        >
          <div
            class="flex size-9 items-center justify-center rounded-lg transition-colors"
            :class="a.accent"
          >
            <UIcon :name="a.icon" class="size-4" />
          </div>
          <div>
            <p class="text-sm font-semibold text-neutral-950">{{ a.label }}</p>
            <p class="mt-0.5 text-xs leading-snug text-neutral-500">
              {{ a.description }}
            </p>
          </div>
          <UIcon
            name="i-heroicons-arrow-up-right-20-solid"
            class="absolute right-3 top-3 size-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
      </template>
    </div>
  </section>
</template>
