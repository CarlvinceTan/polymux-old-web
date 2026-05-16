import type { FileIconName } from '~/composables/ui/useFileIcons'

// 'b2' is the polymux-managed "Cloud" backend (Backblaze B2). It coexists
// with the user-owned Google Drive backend and the per-device Local (OPFS)
// backend. Plan gating lives in PLAN_CLOUD_BYTES — Free has no cap so the
// UI shows it as locked/upgrade-only.
export type StorageProvider = 'google-drive' | 'local' | 'b2'

export interface SelectedItem {
  kind: 'file' | 'folder'
  name: string
  path: string
  icon: FileIconName
  provider: StorageProvider
}
