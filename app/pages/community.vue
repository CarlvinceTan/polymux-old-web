<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const searchQuery = ref('')

interface CommunityTile {
  label: string
  description: string
  icon: string
  to?: string
  disabled?: boolean
}

const tiles: CommunityTile[] = [
  {
    label: 'Blog',
    description: 'Product updates, engineering notes, and guides',
    icon: 'i-heroicons-newspaper-20-solid',
    to: '/blog',
  },
  {
    label: 'Documentation',
    description: 'Guides, references, and API docs',
    icon: 'i-heroicons-book-open-20-solid',
    to: '/documentation',
  },
  {
    label: 'Forum',
    description: 'Ask questions, share ideas, connect with others',
    icon: 'i-heroicons-chat-bubble-left-right-20-solid',
    disabled: true,
  },
]
</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-4xl">
      <!-- Hero section -->
      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          Polymux Community
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          Updates, discussions, and resources for Polymux users
        </p>

        <!-- Search bar -->
        <div class="mx-auto mt-10 max-w-[560px]">
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search community..."
              class="w-full rounded-lg border border-neutral-200 px-4 py-3 pl-11 text-base text-neutral-950 placeholder-neutral-500 transition-colors focus:border-neutral-300 focus:outline-none"
            >
            <UIcon
              name="i-heroicons-magnifying-glass-20-solid"
              class="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-neutral-400"
            />
          </div>
        </div>
      </header>

      <hr class="my-12 border-neutral-200 sm:border-neutral-200/[.85]" />

      <!-- Tiles grid -->
      <div class="grid gap-6 sm:grid-cols-3">
        <NuxtLink
          v-for="tile in tiles"
          :key="tile.label"
          :to="tile.to"
          :class="[
            'group relative rounded-xl border border-neutral-200 p-6 transition-all',
            tile.disabled
              ? 'cursor-not-allowed bg-neutral-50/50 opacity-60'
              : 'bg-white hover:border-neutral-300 hover:shadow-sm',
          ]"
        >
          <div v-if="tile.disabled" class="absolute right-4 top-4">
            <span class="inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
              Coming soon
            </span>
          </div>

          <UIcon :name="tile.icon" class="size-8 text-neutral-400 group-hover:text-neutral-600" />
          <h3 class="mt-4 text-lg font-semibold text-neutral-950">
            {{ tile.label }}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-neutral-600">
            {{ tile.description }}
          </p>

          <div v-if="!tile.disabled" class="mt-4 flex items-center text-sm font-medium text-neutral-700 group-hover:text-neutral-950">
            Explore
            <UIcon name="i-heroicons-arrow-right-20-solid" class="ml-2 size-4 transition-transform group-hover:translate-x-1" />
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
