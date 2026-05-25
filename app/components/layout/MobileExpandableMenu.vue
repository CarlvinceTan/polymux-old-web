<script setup lang="ts">
export interface MobileExpandableMenuOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  label: string
  icon?: string
  options: MobileExpandableMenuOption[]
  modelValue: string
  plain?: boolean
  size?: 'md' | 'sm'
}>(), {
  plain: false,
  size: 'md',
})

const emit = defineEmits<{
  select: [value: string]
}>()

const isOpen = ref(false)

function toggle() {
  isOpen.value = !isOpen.value
}

function selectOption(value: string) {
  emit('select', value)
  isOpen.value = false
}

const triggerClasses = computed(() => {
  if (props.plain) {
    if (props.size === 'sm') {
      return isOpen.value
        ? 'bg-neutral-200/70 font-medium text-neutral-950'
        : 'text-neutral-600 hover:bg-neutral-200/40 hover:text-neutral-900'
    }
    return isOpen.value
      ? 'bg-neutral-100 font-semibold text-neutral-950'
      : 'text-neutral-600 hover:text-neutral-950'
  }
  return isOpen.value
    ? 'bg-neutral-50 text-neutral-950'
    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950'
})

const triggerBaseClasses = computed(() => {
  if (props.plain) {
    return props.size === 'sm'
      ? 'block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium outline-none transition-colors'
      : 'block w-full rounded-md px-3 py-2 text-left text-base font-medium outline-none transition-colors hover:bg-neutral-50'
  }
  return 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-base font-medium outline-none transition-colors'
})

const optionClasses = (selected: boolean) => {
  if (props.plain) {
    if (props.size === 'sm') {
      return selected
        ? 'bg-neutral-200/70 font-medium text-neutral-950'
        : 'text-neutral-600 hover:bg-neutral-200/40 hover:text-neutral-900'
    }
    return selected
      ? 'bg-neutral-100 font-semibold text-neutral-950'
      : 'text-neutral-600 hover:text-neutral-950'
  }
  return selected
    ? 'bg-neutral-100 font-semibold text-neutral-950'
    : 'text-neutral-600 hover:text-neutral-950'
}

const optionBaseClasses = computed(() => {
  if (props.plain) {
    return props.size === 'sm'
      ? 'block w-full rounded-md px-2 py-1.5 pl-2 text-left text-sm font-medium outline-none transition-colors'
      : 'block w-full rounded-md px-3 py-2 text-left text-base font-medium outline-none transition-colors hover:bg-neutral-50'
  }
  return 'block w-full px-3 py-2 pl-10 text-left text-base font-medium outline-none transition-colors hover:bg-neutral-50'
})
</script>

<template>
  <div>
    <button
      type="button"
      :class="[triggerBaseClasses, triggerClasses]"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <UIcon
        v-if="icon && !plain"
        :name="icon"
        class="size-5 shrink-0"
        aria-hidden="true"
      />
      <span :class="plain ? '' : 'min-w-0 flex-1'">{{ label }}</span>
      <UIcon
        v-if="!plain"
        name="i-heroicons-chevron-down-20-solid"
        class="size-4 shrink-0 transition-transform"
        :class="isOpen ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="isOpen" class="overflow-hidden">
        <div class="flex flex-col">
          <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            :class="[optionBaseClasses, optionClasses(opt.value === modelValue)]"
            @click="selectOption(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
