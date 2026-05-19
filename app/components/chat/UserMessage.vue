<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ChatMessageAttachment } from '~/composables/types'

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
const editFileInputRef = ref<HTMLInputElement | null>(null)
const editorRef = ref<InstanceType<typeof import('./InlineChipEditor.vue').default> | null>(null)

const { attachments: editAttachments, addFiles, removeFile, clearAll, seed } = useAttachments()

function startEdit() {
  editText.value = props.text
  seed(props.attachments ?? [])
  editing.value = true
  nextTick(() => {
    editorRef.value?.focus()
  })
}

function cancelEdit() {
  editing.value = false
  clearAll()
}

async function submitEdit(text: string, attachments: ChatMessageAttachment[]) {
  const trimmed = text.trim()
  if (!trimmed && attachments.length === 0) return
  if (props.canSubmitEdit) {
    const ok = await props.canSubmitEdit(trimmed, attachments)
    if (!ok) return
  }
  editing.value = false
  emit('edit', trimmed, attachments)
  clearAll()
}

function onRemoveEditFile(id: string) {
  removeFile(id, props.sessionId)
}

function onEditAttachClick() {
  editorRef.value?.rememberSelection?.()
  editFileInputRef.value?.click()
}

function onEditFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  // FileList is live: `input.value = ''` below empties it before addFiles'
  // async path (await fetchUploadConfig) gets to iterate. Snapshot via a
  // DataTransfer-owned FileList so addFiles still sees the selected files.
  const dt = new DataTransfer()
  for (const f of input.files) dt.items.add(f)
  addFiles(props.sessionId, dt.files, props.workspaceId ?? undefined)
  input.value = ''
}

function onEditSendClick() {
  editorRef.value?.submit?.()
}

// Server-loaded messages have no position info; fall back to the grouped
// chip row below the bubble. Locally-sent messages carry positions and
// render inline.
const displayTokens = computed(() => {
  const atts = props.attachments ?? []
  const hasPositions = atts.some(a => typeof a.position === 'number')
  if (!hasPositions) {
    return { inline: false, tokens: [{ kind: 'text' as const, text: props.text }] }
  }
  return { inline: true, tokens: interleaveAttachments(props.text, atts) }
})
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
      <InlineChipEditor
        ref="editorRef"
        v-model="editText"
        :attachments="editAttachments"
        :max-lines="8"
        class="text-sm"
        @submit="submitEdit"
        @remove-attachment="onRemoveEditFile"
      />
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
            @click="onEditSendClick"
          >
            {{ t('common.send') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Display mode -->
    <template v-else>
      <div class="min-w-0 rounded-[1.25rem] bg-[#e8e8e8] px-3 py-1.5">
        <!-- Inline rendering: tokens are interleaved text and chips. We use
             whitespace-pre-wrap so newlines and runs of spaces inside text
             tokens render the way the user typed them. -->
        <p
          v-if="displayTokens.inline"
          class="m-0 text-left text-sm leading-relaxed text-neutral-800 break-words whitespace-pre-wrap"
        >
          <template v-for="(tok, i) in displayTokens.tokens" :key="i">
            <span v-if="tok.kind === 'text'">{{ tok.text }}</span>
            <!-- align-top so the chip's centre lines up with the bubble's
                 line-box centre. align-middle would push it to text-baseline
                 + half-x-height, which is visibly below the caret centre. -->
            <span
              v-else
              class="inline-flex align-top mx-0.5"
            >
              <FileAttachment
                :name="tok.att.name"
                :removable="false"
              />
            </span>
          </template>
        </p>

        <!-- Legacy / server-loaded layout: text bubble + chip row below. -->
        <template v-else>
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
        </template>
      </div>
      <div class="mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <MessageAction icon="i-heroicons-pencil-square-20-solid" :label="t('common.edit')" @click="startEdit" />
        <MessageAction :icon="copied ? 'i-heroicons-check' : 'i-heroicons-square-2-stack'" :label="t('common.copy')" @click="copy(text)" />
      </div>
    </template>
  </div>
</template>
