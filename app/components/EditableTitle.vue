<script setup lang="ts">
const { t } = useI18n()

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isEditing = ref(false)
const editingValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function startEdit() {
  if (props.disabled) return
  isEditing.value = true
  editingValue.value = props.modelValue
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.setSelectionRange(inputRef.value.value.length, inputRef.value.value.length)
    }
  })
}

function confirm() {
  const value = editingValue.value.trim()
  editingValue.value = ''
  isEditing.value = false
  if (value) {
    emit('update:modelValue', value)
  }
}

function cancel() {
  isEditing.value = false
  editingValue.value = ''
}
</script>

<template>
  <input
    v-if="isEditing"
    ref="inputRef"
    v-model="editingValue"
    class="min-w-0 w-full bg-transparent border-0 border-b-2 border-neutral-400 outline-none text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title"
    @keyup.enter="confirm"
    @keyup.esc="cancel"
    @blur="confirm"
  />
  <h2
    v-else
    class="min-w-0 text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title select-none"
    :class="!disabled ? 'cursor-text' : 'cursor-default'"
    :title="!disabled ? t('chat.doubleClickToRename') : undefined"
    @dblclick="startEdit"
  >
    {{ modelValue }}
  </h2>
</template>
