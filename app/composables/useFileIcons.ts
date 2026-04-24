export type FileIconName =
  | 'folder'
  | 'image'
  | 'file-code'
  | 'file-text'
  | 'video'
  | 'audio'
  | 'key'
  | 'archive'
  | 'calendar'
  | 'spreadsheet'
  | 'presentation'
  | 'database'
  | 'font'
  | 'config'
  | 'executable'
  | 'file'

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif',
])

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'go', 'rs', 'rb', 'java',
  'c', 'cpp', 'h', 'cs', 'swift', 'kt', 'sh', 'bash', 'yaml', 'yml',
  'json', 'toml', 'xml', 'html', 'css', 'scss', 'sql', 'dart', 'r',
  'lua', 'zig', 'nim', 'ex', 'exs', 'erl', 'hs', 'ml', 'fs', 'clj',
  'lisp', 'scala', 'perl', 'php', 'm', 'mm', 'pl', 'ps1', 'v', 'sv',
])

const DOC_EXTS = new Set([
  'pdf', 'doc', 'docx', 'txt', 'rtf', 'md', 'csv', 'odt', 'epub',
])

const VIDEO_EXTS = new Set([
  'mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'm4v', '3gp',
])

const AUDIO_EXTS = new Set([
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'mid', 'midi',
])

const KEY_EXTS = new Set([
  'key', 'pem', 'crt', 'p12', 'pfx', 'pub', 'cer', 'p7b', 'jks', 'ks',
])

const ARCHIVE_EXTS = new Set([
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'iso', 'pkg',
  'deb', 'rpm', 'apk', 'war', 'ear', 'jar',
])

const CALENDAR_EXTS = new Set(['ics', 'ical', 'ifb'])

const SPREADSHEET_EXTS = new Set([
  'xls', 'xlsx', 'numbers', 'ods',
])

const PRESENTATION_EXTS = new Set([
  'ppt', 'pptx', 'key', 'odp',
])

const DATABASE_EXTS = new Set([
  'db', 'sqlite', 'sqlite3', 'mdb', 'accdb',
])

const FONT_EXTS = new Set([
  'ttf', 'otf', 'woff', 'woff2', 'eot',
])

const CONFIG_EXTS = new Set([
  'env', 'ini', 'conf', 'cfg', 'properties', 'toml',
])

const EXECUTABLE_EXTS = new Set([
  'exe', 'msi', 'app', 'bat', 'cmd', 'com', 'gadget',
  'run', 'scr', 'ws',
])

function extensionFromName(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === name.length - 1) return ''
  return name.slice(dotIndex + 1).toLowerCase()
}

function iconFromExtension(ext: string): FileIconName {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (CODE_EXTS.has(ext)) return 'file-code'
  if (DOC_EXTS.has(ext)) return 'file-text'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (KEY_EXTS.has(ext)) return 'key'
  if (ARCHIVE_EXTS.has(ext)) return 'archive'
  if (CALENDAR_EXTS.has(ext)) return 'calendar'
  if (SPREADSHEET_EXTS.has(ext)) return 'spreadsheet'
  if (PRESENTATION_EXTS.has(ext)) return 'presentation'
  if (DATABASE_EXTS.has(ext)) return 'database'
  if (FONT_EXTS.has(ext)) return 'font'
  if (CONFIG_EXTS.has(ext)) return 'config'
  if (EXECUTABLE_EXTS.has(ext)) return 'executable'
  return 'file'
}

export function useFileIcons() {
  function getIconForFile(name: string): FileIconName {
    const ext = extensionFromName(name)
    if (!ext) return 'file'
    return iconFromExtension(ext)
  }

  function getIconForFolder(): FileIconName {
    return 'folder'
  }

  return { getIconForFile, getIconForFolder }
}
