<script setup lang="ts">
interface Review {
  name: string
  handle: string
  initials: string
  text: string
}

const reviews: Review[] = [
  { name: 'Sarah Chen', handle: '@sarachen', initials: 'SC', text: 'Polymux has completely transformed how we handle automation. The multi-agent system is incredibly powerful and intuitive to configure.' },
  { name: 'Marcus Rodriguez', handle: '@mrodriguez', initials: 'MR', text: "Best AI orchestration platform I've used. The live browser sessions feature alone is worth the subscription price." },
  { name: 'Emily Watson', handle: '@emwatson', initials: 'EW', text: 'We deployed 15 agents in our first week. The marketplace made it incredibly easy to get started with pre-built workflows.' },
  { name: 'David Park', handle: '@dpark', initials: 'DP', text: 'The vault feature gives us peace of mind with our API credentials. Enterprise-grade security with a developer-friendly interface.' },
  { name: 'Lisa Thompson', handle: '@lisathompson', initials: 'LT', text: "Polymux turned a 3-hour manual process into a 5-minute automated workflow. Our team's productivity has skyrocketed since adopting it." },
  { name: 'James Miller', handle: '@jmiller', initials: 'JM', text: 'The real-time browser preview is a game changer. Being able to watch agents work gives us full visibility and confidence in our automations.' },
]

const doubledReviews = [...reviews, ...reviews]
</script>

<template>
  <div class="overflow-hidden bg-[#F9F9F9] py-16 sm:py-20">
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div class="mb-12 text-center">
        <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
          Loved by people everywhere
        </h2>
        <p class="mt-4 text-lg text-neutral-500">
          See what our users have to say about Polymux.
        </p>
      </div>
    </div>
    <div class="relative">
      <div class="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#F9F9F9] to-transparent sm:w-24" />
      <div class="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#F9F9F9] to-transparent sm:w-24" />
      <div class="carousel-track flex gap-5 pl-4">
        <div v-for="(review, i) in doubledReviews" :key="i" class="w-72 shrink-0 sm:w-80">
          <div class="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5">
            <div class="mb-4 flex aspect-video items-center justify-center rounded-lg bg-neutral-50">
              <svg class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.75">
                <polygon points="5 3 19 12 5 21" />
              </svg>
            </div>
            <p class="line-clamp-3 flex-1 text-sm leading-relaxed text-neutral-600">
              {{ review.text }}
            </p>
            <div class="mt-4 flex items-center gap-3 border-t border-neutral-100 pt-4">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
                {{ review.initials }}
              </div>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-neutral-950">
                  {{ review.name }}
                </p>
                <p class="truncate text-xs text-neutral-400">
                  {{ review.handle }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.carousel-track {
  /* Duplicated row + −50% travel; reverse = scroll left → right */
  animation: scroll-carousel 35s linear infinite reverse;
  width: max-content;
}

@keyframes scroll-carousel {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
