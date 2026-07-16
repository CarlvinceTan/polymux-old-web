<script setup lang="ts">
import { useI18n } from '#imports'

const { t } = useI18n()
const { headerTabs, customTabs } = useIntegrationsNavTabs()
const router = useRouter()

type Kind = 'integration' | 'workflow' | 'plugin' | 'layout'

const kind = ref<Kind | null>(null)

const KINDS = computed(() => ([
  {
    value: 'integration' as const,
    title: t('integrations.editorNewIntegration'),
    description: t('integrations.editorNewIntegrationDesc'),
    icon: 'i-heroicons-link-20-solid',
  },
  {
    value: 'workflow' as const,
    title: t('integrations.editorNewWorkflow'),
    description: t('integrations.editorNewWorkflowDesc'),
    icon: 'i-heroicons-bolt-20-solid',
  },
  {
    value: 'plugin' as const,
    title: t('integrations.editorNewPlugin'),
    description: t('integrations.editorNewPluginDesc'),
    icon: 'i-heroicons-cube-transparent-20-solid',
  },
  {
    value: 'layout' as const,
    title: t('integrations.editorNewLayout'),
    description: t('integrations.editorNewLayoutDesc'),
    icon: 'i-heroicons-squares-2x2-20-solid',
  },
]))

function pick(k: Kind) {
  kind.value = k
  router.push(`/integrations/publish/new/${k}`)
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <SubNav :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6" style="padding: 2.5rem 1.5rem">
        <NuxtLink
          to="/integrations/publish"
          class="flex items-center gap-1.5 self-start text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
        >
          <UIcon name="i-heroicons-arrow-left-20-solid" class="size-3.5" />
          {{ t('integrations.editorBack') }}
        </NuxtLink>

        <div>
          <h1 class="text-title-sm font-semibold tracking-tight text-neutral-950">
            {{ t('integrations.editorPickKind') }}
          </h1>
          <p class="mt-1 text-body-md text-neutral-500">
            {{ t('integrations.editorSubtitle') }}
          </p>
        </div>

        <div class="grid gap-4" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))">
          <button
            v-for="k in KINDS"
            :key="k.value"
            type="button"
            class="ghost-panel ghost-panel-hover group flex flex-col gap-3 rounded-xl bg-white p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
            @click="pick(k.value)"
          >
            <div class="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-neutral-950 group-hover:text-white">
              <UIcon :name="k.icon" class="size-5" />
            </div>
            <div>
              <p class="text-sm font-semibold leading-tight text-neutral-950">
                {{ k.title }}
              </p>
              <p class="mt-1.5 text-body-md leading-relaxed text-neutral-500">
                {{ k.description }}
              </p>
            </div>
          </button>
        </div>
      </div>
    </TabPanel>
  </div>
</template>
