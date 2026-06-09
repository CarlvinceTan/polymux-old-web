<script setup lang="ts">
import type { BrowserImportFamily, BrowserImportSource } from '~/types/polymux-native'
import { importEntryKey } from '~/utils/vault/passwordImport'
import type { ImportSelectionRow } from '~/composables/vault/usePasswordImport'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  imported: [count: number]
  done: []
}>()

const { t } = useI18n()
const {
  canAutoImport,
  detectCurrentBrowserFamily,
  detectNativeSources,
  readNativeSource,
  parseImportFile,
  toSelectionRows,
} = usePasswordImport()
const { passwords, importPasswords } = usePasswords()

type Phase = 'source' | 'review' | 'importing' | 'complete'

const phase = ref<Phase>('source')
const manualFamily = ref<BrowserImportFamily>('chromium')
const nativeSources = ref<BrowserImportSource[]>([])
const nativeLoading = ref(false)
const nativeError = ref('')
const fileError = ref('')
const rows = ref<ImportSelectionRow[]>([])
const importResult = ref({ imported: 0, failed: 0 })
const fileInputRef = ref<HTMLInputElement | null>(null)
const reviewSearch = ref('')

const manualFamilies: BrowserImportFamily[] = ['chromium', 'firefox', 'safari']

const existingKeys = computed(() => {
  const keys = new Set<string>()
  for (const pwd of passwords.value) {
    keys.add(importEntryKey(pwd.url, pwd.username))
  }
  return keys
})

const filteredRows = computed(() => {
  const q = reviewSearch.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(row =>
    row.name.toLowerCase().includes(q)
    || row.url.toLowerCase().includes(q)
    || row.username.toLowerCase().includes(q),
  )
})

const selectedCount = computed(() => rows.value.filter(row => row.selected).length)
const allVisibleSelected = computed(() =>
  filteredRows.value.length > 0 && filteredRows.value.every(row => row.selected),
)
const someVisibleSelected = computed(() =>
  filteredRows.value.some(row => row.selected) && !allVisibleSelected.value,
)

const subtitle = computed(() => {
  if (phase.value === 'source') {
    return canAutoImport.value
      ? t('vault.passwords.import.subtitleNative')
      : t('vault.passwords.import.subtitleWeb')
  }
  if (phase.value === 'review') {
    return t('vault.passwords.import.reviewSubtitle', { count: rows.value.length })
  }
  if (phase.value === 'importing') {
    return t('vault.passwords.import.importingSubtitle')
  }
  return t('vault.passwords.import.completeSubtitle', importResult.value)
})

const instructionSteps = computed(() => {
  const prefix = `vault.passwords.import.instructions.${manualFamily.value}`
  return [1, 2, 3].map(n => t(`${prefix}.step${n}`))
})

function hostLabel(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
  }
  catch {
    return url
  }
}

async function loadNativeSources() {
  nativeLoading.value = true
  nativeError.value = ''
  try {
    nativeSources.value = await detectNativeSources()
  }
  catch {
    nativeError.value = t('vault.passwords.import.nativeDetectFailed')
    nativeSources.value = []
  }
  finally {
    nativeLoading.value = false
  }
}

function resetState() {
  phase.value = 'source'
  manualFamily.value = detectCurrentBrowserFamily()
  nativeSources.value = []
  nativeLoading.value = false
  nativeError.value = ''
  fileError.value = ''
  rows.value = []
  importResult.value = { imported: 0, failed: 0 }
  reviewSearch.value = ''
}

function openReview(entries: ImportSelectionRow[]) {
  if (entries.length === 0) {
    fileError.value = t('vault.passwords.import.noEntriesFound')
    return
  }
  rows.value = entries
  phase.value = 'review'
  fileError.value = ''
}

async function handleNativeImport(source: BrowserImportSource) {
  fileError.value = ''
  nativeLoading.value = true
  try {
    const entries = await readNativeSource(source.id)
    openReview(toSelectionRows(entries, existingKeys.value))
  }
  catch {
    fileError.value = t('vault.passwords.import.nativeReadFailed')
  }
  finally {
    nativeLoading.value = false
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  fileError.value = ''
  try {
    const parsed = await parseImportFile(file, manualFamily.value)
    openReview(toSelectionRows(parsed.entries, existingKeys.value))
  }
  catch {
    fileError.value = t('vault.passwords.import.parseFailed')
  }
}

function triggerFilePicker() {
  fileInputRef.value?.click()
}

function toggleAllVisible(checked: boolean) {
  const visibleIds = new Set(filteredRows.value.map(row => row.id))
  rows.value = rows.value.map(row =>
    visibleIds.has(row.id) ? { ...row, selected: checked } : row,
  )
}

async function confirmImport() {
  const selected = rows.value.filter(row => row.selected)
  if (selected.length === 0) return

  phase.value = 'importing'
  const result = await importPasswords(selected.map(row => ({
    name: row.name,
    url: row.url,
    username: row.username,
    password: row.password,
  })))
  importResult.value = result
  phase.value = 'complete'
  emit('imported', result.imported)
}

function handleDone() {
  resetState()
  emit('done')
}

watch(() => props.active, async (active) => {
  if (!active) {
    resetState()
    return
  }
  resetState()
  manualFamily.value = detectCurrentBrowserFamily()
  if (canAutoImport.value) {
    await loadNativeSources()
  }
})

defineExpose({ phase })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <p class="mb-3 text-xs text-neutral-500">
      {{ subtitle }}
    </p>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <template v-if="phase === 'source'">
        <div v-if="canAutoImport" class="mb-3 space-y-3">
          <p class="text-xs font-medium text-neutral-700">
            {{ t('vault.passwords.import.detectedBrowsers') }}
          </p>

          <div v-if="nativeLoading" class="py-4 text-center text-xs text-neutral-500">
            {{ t('vault.passwords.import.scanning') }}
          </div>

          <div v-else-if="nativeSources.length > 0" class="space-y-1.5">
            <button
              v-for="source in nativeSources"
              :key="source.id"
              type="button"
              class="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-left text-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
              @click="handleNativeImport(source)"
            >
              <span class="font-medium text-neutral-900">{{ source.name }}</span>
              <span class="text-neutral-500">
                {{ t('vault.passwords.import.profileCount', { count: source.profileCount }) }}
              </span>
            </button>
          </div>

          <p v-else class="text-xs text-neutral-500">
            {{ nativeError || t('vault.passwords.import.noBrowsersDetected') }}
          </p>

          <div class="border-t border-neutral-100 pt-3">
            <p class="text-xs text-neutral-500">
              {{ t('vault.passwords.import.orManual') }}
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
            <button
              v-for="family in manualFamilies"
              :key="family"
              type="button"
              class="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all"
              :class="manualFamily === family ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'"
              @click="manualFamily = family"
            >
              {{ t(`vault.passwords.import.browsers.${family}`) }}
            </button>
          </div>

          <p
            v-if="manualFamily === 'chromium'"
            class="text-[11px] leading-relaxed text-neutral-400"
          >
            {{ t('vault.passwords.import.browsers.chromiumHint') }}
          </p>

          <ol class="space-y-1.5 text-xs leading-relaxed text-neutral-600">
            <li v-for="(step, index) in instructionSteps" :key="index" class="flex items-center gap-2">
              <span class="flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] leading-none text-neutral-500">{{ index + 1 }}</span>
              <span class="min-w-0 flex-1">{{ step }}</span>
            </li>
          </ol>

          <input
            ref="fileInputRef"
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            @change="handleFileChange"
          >

          <button
            type="button"
            class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-3 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-100"
            @click="triggerFilePicker"
          >
            <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m8 11 4 4 4-4" />
              <path d="M4 21h16" />
            </svg>
            {{ t('vault.passwords.import.uploadCsv') }}
          </button>

          <p v-if="fileError" class="text-xs text-red-600">{{ fileError }}</p>

          <p class="text-[11px] leading-relaxed text-neutral-400">
            {{ t('vault.passwords.import.securityNote') }}
          </p>
        </div>
      </template>

      <template v-else-if="phase === 'review'">
        <div class="mb-2 flex items-center gap-2">
          <div class="flex h-7 min-w-0 flex-1 items-center rounded-md border border-neutral-200 bg-neutral-50 px-2">
            <input
              v-model="reviewSearch"
              type="search"
              :placeholder="t('vault.passwords.import.searchPlaceholder')"
              class="min-w-0 flex-1 bg-transparent text-xs text-neutral-950 outline-none placeholder:text-neutral-400"
            >
          </div>
          <span class="shrink-0 text-[11px] text-neutral-500">
            {{ t('vault.passwords.import.selectedCount', { count: selectedCount }) }}
          </span>
        </div>

        <div class="overflow-hidden rounded-lg border border-neutral-200">
          <div class="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-2 border-b border-neutral-100 bg-neutral-50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            <label class="flex size-6 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                class="size-3.5 rounded border-neutral-300"
                :checked="allVisibleSelected"
                :indeterminate="someVisibleSelected"
                @change="toggleAllVisible(($event.target as HTMLInputElement).checked)"
              >
            </label>
            <span>{{ t('vault.passwords.import.colName') }}</span>
            <span>{{ t('vault.passwords.import.colUsername') }}</span>
            <span>{{ t('vault.passwords.import.colSite') }}</span>
          </div>

          <div class="max-h-56 overflow-y-auto divide-y divide-neutral-100">
            <label
              v-for="row in filteredRows"
              :key="row.id"
              class="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-2 px-2 py-1.5 text-xs transition-colors hover:bg-neutral-50"
              :class="row.duplicate ? 'opacity-60' : ''"
            >
              <span class="flex size-6 items-center justify-center">
                <input
                  v-model="row.selected"
                  type="checkbox"
                  class="size-3.5 rounded border-neutral-300"
                >
              </span>
              <span class="truncate font-medium text-neutral-900">{{ row.name }}</span>
              <span class="truncate text-neutral-600">{{ row.username }}</span>
              <span class="truncate text-neutral-400">{{ hostLabel(row.url) }}</span>
            </label>
          </div>
        </div>

        <p v-if="rows.some(row => row.duplicate)" class="mt-2 text-[11px] text-neutral-500">
          {{ t('vault.passwords.import.duplicateHint') }}
        </p>
      </template>

      <div v-else-if="phase === 'importing'" class="flex flex-col items-center justify-center py-8 text-center">
        <div class="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
        <p class="mt-3 text-xs text-neutral-500">{{ t('vault.passwords.import.importing') }}</p>
      </div>

      <div v-else class="py-6 text-center">
        <p class="text-sm font-medium text-neutral-900">
          {{ t('vault.passwords.import.completeTitle', importResult) }}
        </p>
        <p v-if="importResult.failed > 0" class="mt-1 text-xs text-red-600">
          {{ t('vault.passwords.import.completeFailed', importResult) }}
        </p>
      </div>
    </div>

    <div class="mt-4 flex shrink-0 justify-end gap-2 border-t border-neutral-100 pt-3.5">
      <template v-if="phase === 'review'">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
          @click="phase = 'source'"
        >
          {{ t('vault.passwords.import.back') }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="selectedCount === 0"
          @click="confirmImport"
        >
          {{ t('vault.passwords.import.importSelected', { count: selectedCount }) }}
        </button>
      </template>

      <button
        v-else-if="phase !== 'importing'"
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        :class="phase === 'complete' ? 'bg-neutral-950 text-white hover:bg-neutral-800' : 'bg-white text-neutral-950 ring-1 ring-neutral-200 hover:bg-neutral-50'"
        @click="handleDone"
      >
        {{ phase === 'complete' ? t('vault.passwords.import.done') : t('common.cancel') }}
      </button>
    </div>
  </div>
</template>
