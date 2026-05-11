import type { FileIconName } from '~/composables/ui/useFileIcons'

export type StorageProvider = 'google-drive' | 'local'

export interface SelectedItem {
  kind: 'file' | 'folder'
  name: string
  path: string
  icon: FileIconName
  provider: StorageProvider
}
