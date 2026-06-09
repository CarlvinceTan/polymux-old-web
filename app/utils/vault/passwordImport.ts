import type { BrowserImportFamily } from '~/types/polymux-native'

export interface ImportPasswordDraft {
  id: string
  name: string
  url: string
  username: string
  password: string
}

export interface ParsePasswordCsvResult {
  entries: ImportPasswordDraft[]
  format: BrowserImportFamily | 'generic'
  warnings: string[]
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      }
      else if (char === '"') {
        inQuotes = false
      }
      else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    }
    else if (char === ',') {
      row.push(field)
      field = ''
    }
    else if (char === '\n' || (char === '\r' && next === '\n')) {
      row.push(field)
      field = ''
      if (row.some(cell => cell.trim())) rows.push(row)
      row = []
      if (char === '\r') i++
    }
    else if (char !== '\r') {
      field += char
    }
  }

  row.push(field)
  if (row.some(cell => cell.trim())) rows.push(row)
  return rows
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function extractDomain(input: string): string {
  try {
    const href = input.startsWith('http') ? input : `https://${input}`
    return new URL(href).hostname
  }
  catch {
    return input.replace(/\/.*$/, '').replace(/^https?:\/\//, '')
  }
}

export function derivePasswordName(url: string, fallback?: string): string {
  const trimmed = fallback?.trim()
  if (trimmed) return trimmed

  const domain = extractDomain(url)
  const parts = domain.replace(/^www\./, '').split('.')
  const label = parts[0] || domain
  if (!label) return 'Imported'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function normalizeImportUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

export function importEntryKey(url: string, username: string): string {
  return `${extractDomain(url).toLowerCase()}::${username.trim().toLowerCase()}`
}

function detectFormat(headers: string[]): BrowserImportFamily | 'generic' {
  const normalized = headers.map(normalizeHeader)
  if (normalized.includes('title') && normalized.includes('url') && normalized.includes('username')) {
    return 'safari'
  }
  if (normalized.includes('name') && normalized.includes('url') && normalized.includes('username')) {
    return 'chromium'
  }
  if (normalized.includes('url') && normalized.includes('username') && normalized.includes('password')) {
    return 'firefox'
  }
  return 'generic'
}

function columnIndex(headers: string[], ...candidates: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const candidate of candidates) {
    const idx = normalized.indexOf(normalizeHeader(candidate))
    if (idx !== -1) return idx
  }
  return -1
}

function rowToEntry(
  row: string[],
  headers: string[],
  format: BrowserImportFamily | 'generic',
  rowIndex: number,
): ImportPasswordDraft | null {
  const urlIdx = columnIndex(headers, 'url', 'website', 'login_uri')
  const userIdx = columnIndex(headers, 'username', 'login_username', 'usernamevalue')
  const passIdx = columnIndex(headers, 'password', 'login_password', 'passwordvalue')
  const nameIdx = columnIndex(headers, 'name', 'title')

  const url = normalizeImportUrl(row[urlIdx] ?? '')
  const username = (row[userIdx] ?? '').trim()
  const password = row[passIdx] ?? ''

  if (!url || !username || !password) return null

  const name = derivePasswordName(url, nameIdx >= 0 ? row[nameIdx] : undefined)

  return {
    id: `import-${rowIndex}-${importEntryKey(url, username)}`,
    name,
    url,
    username,
    password,
  }
}

export function parsePasswordCsv(text: string, preferredFormat?: BrowserImportFamily): ParsePasswordCsvResult {
  const warnings: string[] = []
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) {
    return { entries: [], format: preferredFormat ?? 'generic', warnings: ['empty_file'] }
  }

  const rows = parseCsvRows(trimmed)
  if (rows.length === 0) {
    return { entries: [], format: preferredFormat ?? 'generic', warnings: ['empty_file'] }
  }

  const headers = rows[0]!
  const detected = preferredFormat ?? detectFormat(headers)
  const dataRows = rows.slice(1)

  const entries: ImportPasswordDraft[] = []
  const seen = new Set<string>()

  for (let i = 0; i < dataRows.length; i++) {
    const entry = rowToEntry(dataRows[i]!, headers, detected, i)
    if (!entry) continue

    const key = importEntryKey(entry.url, entry.username)
    if (seen.has(key)) {
      warnings.push('duplicate_row')
      continue
    }
    seen.add(key)
    entries.push(entry)
  }

  if (entries.length === 0) {
    warnings.push('no_valid_rows')
  }

  return { entries, format: detected, warnings }
}

export function detectCurrentBrowserFamily(): BrowserImportFamily {
  if (!import.meta.client) return 'chromium'

  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('firefox')) return 'firefox'
  if (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('edg')) {
    return 'safari'
  }
  return 'chromium'
}
