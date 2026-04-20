<script setup lang="ts">
const props = defineProps<{
  action: string
  detail?: string
  active?: boolean
  icon?: string
}>()

const isChevron = computed(() => !props.icon || props.icon === 'i-heroicons-chevron-down-20-solid')

const expanded = ref(false)
</script>

<template>
  <div class="flex w-full justify-start">
    <div class="flex min-w-0 max-w-[min(100%,36rem)] items-start">
      <div class="min-w-0">
        <component
          :is="isChevron ? 'button' : 'div'"
          :type="isChevron ? 'button' : undefined"
          class="flex items-center gap-1.5 text-left text-meta leading-relaxed sm:text-xs"
          :class="isChevron ? 'group' : ''"
          @click="isChevron && (expanded = !expanded)"
        >
          <UIcon
            :name="icon ?? 'i-heroicons-chevron-down-20-solid'"
            class="size-3.5 shrink-0 text-neutral-400 transition-transform duration-150"
            :class="[
              isChevron ? 'group-hover:text-neutral-600' : '',
              { '-rotate-90': !expanded && isChevron },
            ]"
            aria-hidden="true"
          />
          <span
            class="font-medium"
            :class="active ? 'agent-action-text' : 'text-neutral-500'"
          >{{ action }}</span>
        </component>
        <Transition
          v-if="isChevron"
          enter-active-class="transition-[max-height,opacity] duration-200 ease-out"
          leave-active-class="transition-[max-height,opacity] duration-150 ease-in"
          enter-from-class="max-h-0 opacity-0"
          enter-to-class="max-h-96 opacity-100"
          leave-from-class="max-h-96 opacity-100"
          leave-to-class="max-h-0 opacity-0"
        >
          <div v-if="expanded && detail" class="mt-1 overflow-hidden pl-5">
            <p class="m-0 whitespace-pre-wrap text-meta leading-relaxed text-neutral-400 sm:text-xs">
              {{ detail.trim() }}
            </p>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes agent-action-sweep {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.agent-action-text {
  background-image: linear-gradient(
    90deg,
    #525252 0%,
    #525252 20%,
    #737373 35%,
    #a3a3a3 45%,
    #d4d4d4 50%,
    #a3a3a3 55%,
    #737373 65%,
    #525252 80%,
    #525252 100%
  );
  background-size: 300% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: agent-action-sweep 4s linear infinite;
}
</style>
