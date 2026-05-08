<script setup lang="ts">
definePageMeta({ layout: 'landing' })
useHead({ title: 'Development — Polymux' })

const { t } = useI18n()

type LangKey = 'ts' | 'py' | 'sh'
const activeLang = ref<LangKey>('ts')

const installCmd = 'npm install @polymux/sdk'
const installCopied = ref(false)

async function copyInstall() {
  try {
    await navigator.clipboard.writeText(installCmd)
    installCopied.value = true
    setTimeout(() => { installCopied.value = false }, 1800)
  }
  catch {
    /* clipboard unavailable; ignore silently */
  }
}

const codeSnippets: Record<LangKey, string> = {
  ts: `import { Polymux } from '@polymux/sdk'

const polymux = new Polymux({
  apiKey: process.env.POLYMUX_API_KEY,
})

await polymux.tools.create({
  name: 'fetch_weather',
  schema: { city: 'string' },
  handler: async ({ city }) => fetchWeather(city),
})`,
  py: `from polymux import Polymux

polymux = Polymux(api_key=os.environ["POLYMUX_API_KEY"])

polymux.tools.create(
    name="fetch_weather",
    schema={"city": "string"},
    handler=fetch_weather,
)`,
  sh: `curl https://api.polymux.com/v1/tools \\
  -H "Authorization: Bearer $POLYMUX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "fetch_weather",
    "schema": { "city": "string" }
  }'`,
}

const capabilities = [
  { icon: 'i-heroicons-wrench-screwdriver-20-solid', titleKey: 'development.capabilities.tools.title', descKey: 'development.capabilities.tools.desc' },
  { icon: 'i-heroicons-cursor-arrow-rays-20-solid', titleKey: 'development.capabilities.browser.title', descKey: 'development.capabilities.browser.desc' },
  { icon: 'i-heroicons-key-20-solid', titleKey: 'development.capabilities.vault.title', descKey: 'development.capabilities.vault.desc' },
  { icon: 'i-heroicons-squares-plus-20-solid', titleKey: 'development.capabilities.marketplace.title', descKey: 'development.capabilities.marketplace.desc' },
] as const

const steps = [
  { num: '01', icon: 'i-heroicons-plus-circle-20-solid', titleKey: 'development.steps.create.title', descKey: 'development.steps.create.desc' },
  { num: '02', icon: 'i-heroicons-key-20-solid', titleKey: 'development.steps.keys.title', descKey: 'development.steps.keys.desc' },
  { num: '03', icon: 'i-heroicons-command-line-20-solid', titleKey: 'development.steps.sdk.title', descKey: 'development.steps.sdk.desc' },
  { num: '04', icon: 'i-heroicons-rocket-launch-20-solid', titleKey: 'development.steps.publish.title', descKey: 'development.steps.publish.desc' },
] as const

const galleryItems = [
  { name: 'Slack Notifier', icon: 'i-heroicons-chat-bubble-left-ellipsis-20-solid', desc: 'Post agent updates to your team channels.' },
  { name: 'Linear Sync', icon: 'i-heroicons-list-bullet-20-solid', desc: 'Convert agent outputs into tracked issues.' },
  { name: 'GitHub Actions', icon: 'i-heroicons-code-bracket-20-solid', desc: 'Trigger workflows from CI events.' },
  { name: 'Stripe Reporter', icon: 'i-heroicons-credit-card-20-solid', desc: 'Generate revenue digests on a schedule.' },
  { name: 'Drive Importer', icon: 'i-heroicons-folder-arrow-down-20-solid', desc: 'Pull files into agent context, on demand.' },
  { name: 'Notion Publisher', icon: 'i-heroicons-document-text-20-solid', desc: 'Sync agent runs to a Notion database.' },
] as const

const resources = [
  { to: '/dev/docs', icon: 'i-heroicons-book-open-20-solid', titleKey: 'development.resources.docs.title', descKey: 'development.resources.docs.desc' },
  { to: '/dev/docs#api-reference', icon: 'i-heroicons-rectangle-stack-20-solid', titleKey: 'development.resources.api.title', descKey: 'development.resources.api.desc' },
  { to: '/dev/docs#sdks', icon: 'i-heroicons-rocket-launch-20-solid', titleKey: 'development.resources.examples.title', descKey: 'development.resources.examples.desc' },
  { to: '/community', icon: 'i-heroicons-chat-bubble-left-right-20-solid', titleKey: 'development.resources.community.title', descKey: 'development.resources.community.desc' },
] as const
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-16 sm:py-20 lg:py-28">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div class="flex flex-col gap-6">
            <span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
              <UIcon name="i-heroicons-code-bracket-square-20-solid" class="size-3.5 text-neutral-500" />
              {{ t('development.hero.eyebrow') }}
            </span>
            <h1 class="text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
              {{ t('development.hero.title') }}
            </h1>
            <p class="max-w-lg text-lg leading-relaxed text-neutral-500">
              {{ t('development.hero.subtitle') }}
            </p>
            <div class="flex flex-wrap items-center gap-3 pt-2">
              <NuxtLink
                to="/dev"
                class="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {{ t('development.hero.ctaPrimary') }}
                <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
              </NuxtLink>
              <NuxtLink
                to="#quickstart"
                class="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                {{ t('development.hero.ctaSecondary') }}
                <UIcon name="i-heroicons-arrow-down-20-solid" class="size-4" />
              </NuxtLink>
            </div>
          </div>

          <!-- Terminal mockup -->
          <div class="relative">
            <div class="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-950 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_18px_rgba(26,28,28,0.09)]">
              <div class="flex items-center gap-1.5 border-b border-neutral-800 px-4 py-2.5">
                <span class="size-2.5 rounded-full bg-neutral-700" />
                <span class="size-2.5 rounded-full bg-neutral-700" />
                <span class="size-2.5 rounded-full bg-neutral-700" />
                <span class="ml-3 font-mono text-xs text-neutral-500">polymux-app.ts</span>
              </div>
              <div class="px-5 py-4 font-mono text-[13px] leading-6">
                <div><span class="text-emerald-400">$</span> <span class="text-neutral-100">npm install </span><span class="text-sky-300">@polymux/sdk</span></div>
                <div><span class="text-emerald-400">$</span> <span class="text-neutral-100">polymux init </span><span class="text-amber-300">my-integration</span></div>
                <div class="mt-3 text-neutral-500">&gt; Created <span class="text-neutral-300">my-integration/</span></div>
                <div class="text-neutral-500">&gt; Generated <span class="text-neutral-300">pk_live_…</span></div>
                <div class="text-neutral-500">&gt; Run <span class="text-neutral-300">`polymux dev`</span> to start</div>
                <div class="mt-3"><span class="text-emerald-400">$</span> <span class="text-neutral-100">polymux dev</span><span class="ml-1 inline-block size-2 -mb-0.5 animate-pulse bg-neutral-300" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Capabilities -->
    <section class="bg-[#F9F9F9] py-20 sm:py-24 lg:py-28">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {{ t('development.capabilities.title') }}
          </h2>
          <p class="mt-4 text-lg text-neutral-500">
            {{ t('development.capabilities.subtitle') }}
          </p>
        </div>
        <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="cap in capabilities"
            :key="cap.titleKey"
            class="rounded-xl border border-neutral-200 bg-white p-6"
          >
            <UIcon :name="cap.icon" class="size-8 text-neutral-400" />
            <h3 class="mt-4 text-lg font-semibold text-neutral-950">
              {{ t(cap.titleKey) }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-neutral-600">
              {{ t(cap.descKey) }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- SDK preview -->
    <section id="quickstart" class="scroll-mt-16 bg-white py-20 sm:py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div class="lg:col-span-5">
            <span class="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
              {{ t('development.sdk.eyebrow') }}
            </span>
            <h2 class="mt-4 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              {{ t('development.sdk.title') }}
            </h2>
            <p class="mt-4 text-lg leading-relaxed text-neutral-500">
              {{ t('development.sdk.subtitle') }}
            </p>

            <div class="mt-6 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 text-neutral-400" />
              <code class="flex-1 font-mono text-sm text-neutral-800">{{ installCmd }}</code>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white"
                :aria-label="t('development.sdk.copy')"
                @click="copyInstall"
              >
                <UIcon
                  :name="installCopied ? 'i-heroicons-check-20-solid' : 'i-heroicons-clipboard-document-20-solid'"
                  class="size-4"
                />
                {{ installCopied ? t('development.sdk.copied') : t('development.sdk.copy') }}
              </button>
            </div>

            <ul class="mt-6 space-y-2 text-sm text-neutral-600">
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle-20-solid" class="size-4 text-neutral-400" />
                {{ t('development.sdk.languages.ts') }}
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle-20-solid" class="size-4 text-neutral-400" />
                {{ t('development.sdk.languages.py') }}
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle-20-solid" class="size-4 text-neutral-400" />
                {{ t('development.sdk.languages.go') }}
              </li>
            </ul>
          </div>

          <div class="lg:col-span-7">
            <div class="overflow-hidden rounded-xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_18px_rgba(26,28,28,0.09)]">
              <div class="flex border-b border-neutral-200 bg-white">
                <button
                  v-for="(label, key) in { ts: t('development.sdk.tabs.ts'), py: t('development.sdk.tabs.py'), sh: t('development.sdk.tabs.sh') }"
                  :key="key"
                  type="button"
                  class="-mb-px px-4 py-2.5 text-sm font-medium transition-colors"
                  :class="activeLang === key ? 'border-b-2 border-neutral-950 text-neutral-950' : 'border-b-2 border-transparent text-neutral-500 hover:text-neutral-800'"
                  @click="activeLang = (key as LangKey)"
                >
                  {{ label }}
                </button>
              </div>
              <pre class="overflow-x-auto bg-neutral-950 p-6 font-mono text-[13px] leading-6 text-neutral-100"><code>{{ codeSnippets[activeLang] }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Walkthrough -->
    <section class="bg-[#F9F9F9] py-20 sm:py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {{ t('development.steps.title') }}
          </h2>
          <p class="mt-4 text-lg text-neutral-500">
            {{ t('development.steps.subtitle') }}
          </p>
        </div>
        <div class="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="step in steps"
            :key="step.num"
            class="relative rounded-xl border border-neutral-200 bg-white p-6"
          >
            <span class="inline-flex size-9 items-center justify-center rounded-full bg-neutral-950 font-mono text-sm font-semibold text-white">
              {{ step.num }}
            </span>
            <UIcon :name="step.icon" class="mt-4 block size-7 text-neutral-400" />
            <h3 class="mt-3 text-base font-semibold text-neutral-950">
              {{ t(step.titleKey) }}
            </h3>
            <p class="mt-1.5 text-sm leading-relaxed text-neutral-600">
              {{ t(step.descKey) }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Integrations gallery -->
    <section id="integrations" class="scroll-mt-16 bg-white py-20 sm:py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {{ t('development.gallery.title') }}
          </h2>
          <p class="mt-4 text-lg text-neutral-500">
            {{ t('development.gallery.subtitle') }}
          </p>
        </div>
        <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="item in galleryItems"
            :key="item.name"
            class="flex items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
          >
            <div class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
              <UIcon :name="item.icon" class="size-5 text-neutral-700" />
            </div>
            <div class="min-w-0">
              <h3 class="text-base font-semibold text-neutral-950">
                {{ item.name }}
              </h3>
              <p class="mt-1 line-clamp-2 text-sm text-neutral-600">
                {{ item.desc }}
              </p>
            </div>
          </div>
        </div>
        <div class="mt-10 text-center">
          <NuxtLink
            to="/dev/integrations"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-950"
          >
            {{ t('development.gallery.browseAll') }}
            <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Resources -->
    <section class="bg-[#F9F9F9] py-20 sm:py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {{ t('development.resources.title') }}
          </h2>
          <p class="mt-4 text-lg text-neutral-500">
            {{ t('development.resources.subtitle') }}
          </p>
        </div>
        <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <NuxtLink
            v-for="r in resources"
            :key="r.titleKey"
            :to="r.to"
            class="group flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
          >
            <UIcon :name="r.icon" class="size-7 text-neutral-400" />
            <div>
              <h3 class="text-base font-semibold text-neutral-950">
                {{ t(r.titleKey) }}
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-neutral-600">
                {{ t(r.descKey) }}
              </p>
            </div>
            <span class="mt-auto inline-flex items-center text-sm font-medium text-neutral-700 group-hover:text-neutral-950">
              {{ t('development.resources.open') }}
              <UIcon name="i-heroicons-arrow-right-20-solid" class="ml-1 size-4" />
            </span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="bg-neutral-950 py-16 sm:py-20">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-10 px-4 sm:px-6 lg:flex-row lg:px-8">
        <h2 class="text-center text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-left">
          {{ t('development.cta.title') }}
        </h2>
        <div class="flex flex-col gap-3 sm:min-w-64">
          <NuxtLink
            to="/dev/docs"
            class="rounded-lg border border-neutral-600 px-8 py-3.5 text-center text-base font-medium text-white transition-colors hover:border-neutral-400 hover:bg-neutral-800"
          >
            {{ t('development.cta.secondary') }}
          </NuxtLink>
          <NuxtLink
            to="/dev"
            class="rounded-lg bg-white px-8 py-3.5 text-center text-base font-medium text-neutral-950 transition-opacity hover:opacity-90"
          >
            {{ t('development.cta.primary') }}
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
