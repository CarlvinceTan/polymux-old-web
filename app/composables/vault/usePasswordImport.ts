import type { BrowserImportFamily, BrowserImportSource } from '~/types/polymux-native'
import {
  detectCurrentBrowserFamily,
  importEntryKey,
  parsePasswordCsv,
  type ImportPasswordDraft,
} from '~/utils/vault/passwordImport'

export interface ImportSelectionRow extends ImportPasswordDraft {
  selected: boolean
  duplicate: boolean
}

export function usePasswordImport() {
  const { canAutoImport, bridge } = useAppShell()

  async function detectNativeSources(): Promise<BrowserImportSource[]> {
    if (!canAutoImport.value || !bridge.value?.vault) return []
    try {
      return await bridge.value.vault.detectBrowsers()
    }
    catch {
      return []
    }
  }

  async function readNativeSource(sourceId: string): Promise<ImportPasswordDraft[]> {
    if (!bridge.value?.vault) return []
    const entries = await bridge.value.vault.readPasswords(sourceId)
    return entries.map((entry, index) => ({
      id: `native-${index}-${entry.url}-${entry.username}`,
      name: entry.name,
      url: entry.url,
      username: entry.username,
      password: entry.password,
    }))
  }

  async function parseImportFile(file: File, family?: BrowserImportFamily) {
    const text = await file.text()
    return parsePasswordCsv(text, family)
  }

  function toSelectionRows(
    entries: ImportPasswordDraft[],
    existingKeys: Set<string>,
  ): ImportSelectionRow[] {
    return entries.map((entry) => {
      const key = importEntryKey(entry.url, entry.username)
      const duplicate = existingKeys.has(key)
      return {
        ...entry,
        duplicate,
        selected: !duplicate,
      }
    })
  }

  return {
    canAutoImport,
    detectCurrentBrowserFamily,
    detectNativeSources,
    readNativeSource,
    parseImportFile,
    toSelectionRows,
  }
}
