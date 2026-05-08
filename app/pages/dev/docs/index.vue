<script setup lang="ts">
definePageMeta({ layout: 'dev' })
useHead({ title: 'Docs — Polymux Developers' })

const sections = [
  {
    id: 'getting-started',
    eyebrow: 'Getting Started',
    title: 'Build your first integration',
    body: 'Polymux integrations let you teach agents new capabilities — from posting to Slack to driving a Stripe report. Every integration starts the same way: register an app, install the SDK, and ship a tool that your agents can call.',
  },
  {
    id: 'authentication',
    eyebrow: 'Authentication',
    title: 'API keys and OAuth',
    body: 'Use a publishable key for client-side calls and a signing secret for server-to-server. OAuth scopes are scoped per integration; browser-side calls require the OAuth flow if your integration touches workspace data.',
  },
  {
    id: 'integrations-api',
    eyebrow: 'Integrations API',
    title: 'Tools, hooks, and connectors',
    body: 'The Integrations API exposes three primitives: Tools (callable handlers), Browser hooks (live-session listeners), and Vault providers (custom credential sources). Each lives behind a typed schema and can be tested locally before publish.',
  },
  {
    id: 'webhooks',
    eyebrow: 'Webhooks',
    title: 'Subscribe to platform events',
    body: 'Polymux sends signed webhooks for every major event: workflow.started, agent.handoff, tool.invoked. Verify the signature with your shared secret and ack within 5 seconds — retries follow exponential backoff with jitter.',
  },
  {
    id: 'sdks',
    eyebrow: 'SDKs',
    title: 'TypeScript first, Python and Go in the same shape',
    body: 'The SDKs share a single mental model: clients are constructed from an API key, resources are namespaced (`tools`, `webhooks`, `integrations`), and every method returns a typed response. Source on GitHub under MIT.',
  },
] as const
</script>

<template>
  <div class="bg-white">
    <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div class="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <DevDocsSidebar class="hidden lg:block" />

        <article class="min-w-0">
          <header class="border-b border-neutral-200 pb-8">
            <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Documentation
            </p>
            <h1 class="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Polymux Developer Documentation
            </h1>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">
              Reference, conceptual guides, and end-to-end walkthroughs for building on the Polymux platform. Pick a section from the sidebar, or scroll for an overview.
            </p>
          </header>

          <div class="mt-10 space-y-14">
            <section
              v-for="section in sections"
              :id="section.id"
              :key="section.id"
              class="scroll-mt-20"
            >
              <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {{ section.eyebrow }}
              </p>
              <h2 class="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                {{ section.title }}
              </h2>
              <p class="mt-4 max-w-2xl text-base leading-relaxed text-neutral-700">
                {{ section.body }}
              </p>
              <div class="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500">
                Detailed reference and code samples coming soon. <NuxtLink to="/contact" class="font-medium text-neutral-700 hover:text-neutral-950">Tell us what to write next →</NuxtLink>
              </div>
            </section>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
