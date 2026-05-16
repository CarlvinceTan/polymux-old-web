<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { ChatMessageAttachment } from '~/composables/types'
import { useAutoResizeTextarea } from '~/composables/ui/useAutoResizeTextarea'

const { t } = useI18n()
const { copy, copied } = useClipboard()

const props = defineProps<{
  text: string
  attachments?: ChatMessageAttachment[]
  sessionId: string
  workspaceId?: string | null
  /**
   * Return false to abort send and keep the composer in edit mode.
   * Used for token / budget gates that must run before the optimistic edit applies.
   */
  canSubmitEdit?: (text: string, attachments: ChatMessageAttachment[]) => boolean | Promise<boolean>
}>()

const emit = defineEmits<{
  edit: [text: string, attachments: ChatMessageAttachment[]]
}>()

const editing = ref(false)
const editText = ref('')
const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
const editFileInputRef = ref<HTMLInputElement | null>(null)

const { attachments: editAttachments, addFiles, removeFile, clearAll, seed } = useAttachments()

const { resize: resizeEditTextarea } = useAutoResizeTextarea(editTextareaRef, editText, { maxLines: 8 })

function startEdit() {
  editText.value = props.text
  seed(props.attachments ?? [])
  editing.value = true
  nextTick(() => {
    resizeEditTextarea()
    editTextareaRef.value?.focus()
  })
}

function cancelEdit() {
  editing.value = false
  clearAll()
}

async function submitEdit() {
  const trimmed = editText.value.trim()
  const allAttachments = editAttachments.value
    .filter(a => a.status === 'done')
    .map(a => ({ id: a.id, name: a.name }))
  if (!trimmed && allAttachments.length === 0) return
  if (props.canSubmitEdit) {
    const ok = await props.canSubmitEdit(trimmed, allAttachments)
    if (!ok) return
  }
  editing.value = false
  emit('edit', trimmed, allAttachments)
  clearAll()
}

function onRemoveEditFile(id: string) {
  removeFile(id, props.sessionId)
}

function onEditAttachClick() {
  editFileInputRef.value?.click()
}

function onEditFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  addFiles(props.sessionId, input.files, props.workspaceId ?? undefined)
  input.value = ''
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.isComposing) return
  e.preventDefault()
  void submitEdit()
}
</script>

<template>
  <div
    class="group ml-auto flex max-w-[min(100%,28rem)] flex-col items-end gap-0"
    :class="editing ? 'w-full' : 'w-fit'"
  >
    <!-- Edit mode -->
    <div v-if="editing" class="mb-6 w-full rounded-[1.25rem] border border-neutral-300 bg-white px-3 py-2">
      <input
        ref="editFileInputRef"
        type="file"
        multiple
        class="absolute h-0 w-0 overflow-hidden opacity-0"
        tabindex="-1"
        aria-hidden="true"
        @change="onEditFileChange"
      >
      <textarea
        ref="editTextareaRef"
        v-model="editText"
        rows="1"
        name="message-edit"
        class="w-full resize-none bg-transparent text-sm leading-relaxed text-neutral-800 outline-none"
        @keydown="onEditKeydown"
      />
      <TransitionGroup
        v-if="editAttachments.length > 0"
        tag="div"
        name="chip"
        appear
        class="relative flex flex-wrap-reverse gap-1 pt-1.5"
      >
        <FileAttachment
          v-for="file in editAttachments"
          :key="file.id"
          :name="file.name"
          :status="file.status"
          :progress="file.progress"
          removable
          @remove="onRemoveEditFile(file.id)"
        />
      </TransitionGroup>
      <div class="mt-2 flex items-center justify-between gap-1.5">
        <button
          type="button"
          class="flex items-center justify-center rounded-md p-1 text-secondary transition-opacity hover:opacity-70"
          :aria-label="t('common.attach')"
          @click="onEditAttachClick"
        >
          <UIcon name="i-heroicons-paper-clip-20-solid" class="size-[15px] shrink-0" />
        </button>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            @click="cancelEdit"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
            @click="submitEdit"
          >
            {{ t('common.send') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Display mode -->
    <template v-else>
      <div class="min-w-0 rounded-[1.25rem] bg-[#e8e8e8] px-3 py-1.5">
        <p class="m-0 text-left text-sm leading-relaxed text-neutral-800 break-words">{{ text }}</p>
        <div
          v-if="attachments && attachments.length > 0"
          class="flex flex-wrap gap-1 pt-1.5"
        >
          <FileAttachment
            v-for="file in attachments"
            :key="file.id"
            :name="file.name"
            :removable="false"
          />
        </div>
      </div>
      <div class="mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <MessageAction icon="i-heroicons-pencil-square-20-solid" :label="t('common.edit')" @click="startEdit" />
        <MessageAction :icon="copied ? 'i-heroicons-check' : 'i-heroicons-square-2-stack'" :label="t('common.copy')" @click="copy(text)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.chip-move,
.chip-enter-active,
.chip-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.chip-leave-active {
  position: absolute;
}
</style>
