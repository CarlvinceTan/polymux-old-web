<script setup lang="ts">
const groups = [
  {
    title: 'Getting Started',
    links: [
      { id: 'getting-started', label: 'Overview' },
      { id: 'quickstart', label: 'Quickstart' },
      { id: 'cli', label: 'CLI' },
    ],
  },
  {
    title: 'Authentication',
    links: [
      { id: 'authentication', label: 'API keys' },
      { id: 'oauth', label: 'OAuth flows' },
      { id: 'signing', label: 'Webhook signing' },
    ],
  },
  {
    title: 'Integrations API',
    links: [
      { id: 'integrations-api', label: 'Tools' },
      { id: 'browser', label: 'Browser hooks' },
      { id: 'vault', label: 'Vault providers' },
    ],
  },
  {
    title: 'Webhooks',
    links: [
      { id: 'webhooks', label: 'Subscriptions' },
      { id: 'events', label: 'Events catalogue' },
    ],
  },
  {
    title: 'SDKs',
    links: [
      { id: 'sdks', label: 'Overview' },
      { id: 'sdk-typescript', label: 'TypeScript' },
      { id: 'sdk-python', label: 'Python' },
      { id: 'sdk-go', label: 'Go' },
    ],
  },
] as const
</script>

<template>
  <aside class="lg:sticky lg:top-20">
    <nav class="space-y-6">
      <div v-for="group in groups" :key="group.title">
        <h3 class="px-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {{ group.title }}
        </h3>
        <ul class="mt-2 space-y-0.5">
          <li v-for="link in group.links" :key="link.id">
            <a
              :href="`#${link.id}`"
              class="block rounded-md px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>
      </div>
    </nav>
  </aside>
</template>
