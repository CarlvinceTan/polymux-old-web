<script setup lang="ts">
import { useI18n } from '#imports'

interface PublishResponse {
  ok: true
  integration_id: string
  version_id: string
  slug: string
  version: string
  signing_secret: string
}

const { t } = useI18n()
const { headerTabs, customTabs } = useIntegrationsNavTabs()
const toast = useAppToast()
const router = useRouter()

const manifestUrl = ref('')
const submitting = ref(false)
const result = ref<PublishResponse | null>(null)
const secretCopied = ref(false)

async function onSubmit() {
  if (!manifestUrl.value || submitting.value) return
  submitting.value = true
  try {
    const res = await $fetch<PublishResponse>('/api/marketplace/integrations', {
      method: 'POST',
      body: { manifest_url: manifestUrl.value.trim() },
    })
    result.value = res
  }
  catch (err) {
    const message = (err as { statusMessage?: string })?.statusMessage
      ?? (err as Error)?.message
      ?? t('integrations.publishFailed')
    toast.show(message, 'error')
  }
  finally {
    submitting.value = false
  }
}

async function copySecret() {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value.signing_secret)
  secretCopied.value = true
  setTimeout(() => { secretCopied.value = false }, 2000)
}

function done() {
  if (!result.value) return
  router.push(`/integrations/publish/${result.value.integration_id}`)
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <SubNav :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6" style="padding: 2.5rem 1.5rem">
        <NuxtLink
          to="/integrations/publish/new"
          class="flex items-center gap-1.5 self-start text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
        >
          <UIcon name="i-heroicons-arrow-left-20-solid" class="size-3.5" />
          {{ t('integrations.editorBack') }}
        </NuxtLink>

        <div>
          <h1 class="text-title-sm font-semibold tracking-tight text-neutral-950">
            {{ t('integrations.editorNewIntegration') }}
          </h1>
          <p class="mt-1 text-body-md text-neutral-500">
            {{ t('integrations.editorNewIntegrationDesc') }}
          </p>
        </div>

        <form v-if="!result" class="ghost-panel flex flex-col gap-4 rounded-xl bg-white p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-neutral-950">{{ t('integrations.editorManifestUrl') }}</span>
            <input
              v-model="manifestUrl"
              name="manifest-url"
              type="url"
              required
              placeholder="https://github.com/you/repo/raw/main/polymux.json"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none transition-colors focus:border-neutral-950 placeholder:text-neutral-500"
            >
            <span class="text-label-md text-neutral-500">{{ t('integrations.editorManifestUrlHelp') }}</span>
          </label>
          <button
            type="submit"
            class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!manifestUrl.trim() || submitting"
          >
            {{ submitting ? t('integrations.editorPublishing') : t('integrations.editorPublish') }}
          </button>
        </form>

        <div v-else class="flex flex-col gap-4">
          <div class="ghost-panel flex flex-col gap-3 rounded-xl bg-white p-5">
            <p class="text-sm font-semibold text-neutral-950">
              {{ t('integrations.editorPublished') }}
            </p>
            <p class="text-body-md text-neutral-500">
              {{ result.slug }} · {{ t('integrations.editorVersion', { version: result.version }) }}
            </p>
          </div>

          <div class="ghost-panel flex flex-col gap-2 rounded-xl bg-amber-50 p-5">
            <p class="text-sm font-semibold text-amber-900">
              {{ t('integrations.editorSigningSecret') }}
            </p>
            <p class="text-label-md text-amber-800">
              {{ t('integrations.editorSigningSecretWarning') }}
            </p>
            <div class="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2">
              <code class="min-w-0 flex-1 truncate font-mono text-body-md text-neutral-950">
                {{ result.signing_secret }}
              </code>
              <button
                type="button"
                class="shrink-0 rounded-md bg-neutral-950 px-2.5 py-1 text-label-md font-medium text-white transition-colors hover:bg-neutral-800"
                @click="copySecret"
              >
                {{ secretCopied ? t('integrations.editorCopied') : t('integrations.editorCopy') }}
              </button>
            </div>
          </div>

          <button
            type="button"
            class="self-start rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            @click="done"
          >
            {{ t('integrations.editorOpen') }}
          </button>
        </div>
      </div>
    </TabPanel>
  </div>
</template>
