<script setup lang="ts">
definePageMeta({ layout: 'dev' })
useHead({ title: 'Polymux Developer Platform' })

const quickLinks = [
  { to: '/dev/docs', icon: 'i-heroicons-book-open-20-solid', label: 'Docs', desc: 'Tutorials, concepts, and platform guides.' },
  { to: '/dev/docs#api-reference', icon: 'i-heroicons-rectangle-stack-20-solid', label: 'API Reference', desc: 'Every endpoint, parameter, and webhook.' },
  { to: '/dev/integrations', icon: 'i-heroicons-squares-plus-20-solid', label: 'Integrations', desc: 'Build, test, and publish your integrations.' },
  { to: '/dev/dashboard', icon: 'i-heroicons-chart-bar-20-solid', label: 'Dashboard', desc: 'Usage, deliveries, and live status.' },
] as const

const changelog = [
  { date: '2026-05-02', title: 'Webhook signing v2', desc: 'Outgoing webhooks now sign with rotating ed25519 keys; legacy HMAC stays available through the migration window.' },
  { date: '2026-04-18', title: 'Python SDK 0.4', desc: 'First-class async client, retries with jitter, and the `tools.create()` decorator pattern from TypeScript.' },
  { date: '2026-04-03', title: 'Marketplace beta', desc: 'Approved integrations now show up in the marketplace tab inside every Polymux workspace.' },
] as const
</script>

<template>
  <div>
    <section class="border-b border-neutral-200/60 bg-gradient-to-b from-white to-neutral-50">
      <div class="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <div class="mx-auto max-w-3xl text-center">
          <span class="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
            <span class="size-1.5 rounded-full bg-emerald-500" />
            Developer Platform — Beta
          </span>
          <h1 class="mt-6 text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Polymux Developer Platform
          </h1>
          <p class="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-500">
            Reference, SDKs, and the integration builder — everything you need to extend Polymux with your own tools, browser hooks, and marketplace apps.
          </p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <NuxtLink
              to="/dev/docs"
              class="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Get started
              <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
            </NuxtLink>
            <NuxtLink
              to="/dev/dashboard"
              class="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Open Dashboard
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-white py-16 sm:py-20">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <NuxtLink
            v-for="link in quickLinks"
            :key="link.to"
            :to="link.to"
            class="group flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-6 transition-colors hover:border-neutral-300 hover:shadow-sm"
          >
            <UIcon :name="link.icon" class="size-7 text-neutral-400 group-hover:text-neutral-700" />
            <div>
              <h3 class="text-base font-semibold text-neutral-950">
                {{ link.label }}
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-neutral-600">
                {{ link.desc }}
              </p>
            </div>
            <span class="mt-auto inline-flex items-center text-sm font-medium text-neutral-700 group-hover:text-neutral-950">
              Open
              <UIcon name="i-heroicons-arrow-right-20-solid" class="ml-1 size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="border-t border-neutral-200 bg-neutral-50 py-16 sm:py-20">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div class="mb-10 flex items-end justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Latest updates
            </h2>
            <p class="mt-2 text-sm text-neutral-500">
              New SDKs, breaking changes, and platform improvements.
            </p>
          </div>
          <NuxtLink to="/dev/docs" class="text-sm font-medium text-neutral-700 hover:text-neutral-950">
            All changes →
          </NuxtLink>
        </div>
        <ol class="space-y-6">
          <li
            v-for="entry in changelog"
            :key="entry.date"
            class="flex gap-5 rounded-xl border border-neutral-200 bg-white p-5"
          >
            <time class="shrink-0 font-mono text-xs uppercase tracking-wider text-neutral-500">
              {{ entry.date }}
            </time>
            <div class="min-w-0">
              <h3 class="text-base font-semibold text-neutral-950">
                {{ entry.title }}
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-neutral-600">
                {{ entry.desc }}
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>
