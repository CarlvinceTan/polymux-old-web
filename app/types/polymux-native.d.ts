export type BrowserImportFamily = 'chromium' | 'firefox' | 'safari'

export interface BrowserImportSource {
  id: string
  name: string
  family: BrowserImportFamily
  profileCount: number
}

export interface BrowserImportEntry {
  name: string
  url: string
  username: string
  password: string
}

export interface PolymuxNativeVault {
  detectBrowsers(): Promise<BrowserImportSource[]>
  readPasswords(sourceId: string): Promise<BrowserImportEntry[]>
}

export interface PolymuxNativeBridge {
  shell: 'native' | 'web'
  vault?: PolymuxNativeVault
}

declare global {
  interface Window {
    __POLYMUX__?: PolymuxNativeBridge
  }
}

export {}
