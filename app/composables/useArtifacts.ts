export type ArtifactType = 'image' | 'document' | 'code' | 'video' | 'audio' | 'archive' | 'other'

export interface SandboxArtifact {
  id: string
  name: string
  type: ArtifactType
  size: number
  createdAt: string
  url?: string
  content?: string
  mimeType?: string
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'go', 'rs', 'rb', 'java', 'c', 'cpp', 'h', 'cs', 'swift', 'kt', 'sh', 'bash', 'yaml', 'yml', 'json', 'toml', 'xml', 'html', 'css', 'scss', 'sql', 'md'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'])
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'dmg'])
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'ics'])

function artifactTypeFromName(name: string): ArtifactType {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (CODE_EXTS.has(ext)) return 'code'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (ARCHIVE_EXTS.has(ext)) return 'archive'
  if (DOC_EXTS.has(ext)) return 'document'
  return 'other'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function useArtifacts(sessionId: Ref<string>) {
  const artifacts = useState<SandboxArtifact[]>(`sandbox-artifacts-${sessionId.value}`, () => [])

  function addArtifact(name: string, content?: string, url?: string, size: number = 0, mimeType?: string) {
    const artifact: SandboxArtifact = {
      id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: artifactTypeFromName(name),
      size,
      createdAt: new Date().toISOString(),
      url,
      content,
      mimeType,
    }
    artifacts.value = [...artifacts.value, artifact]
  }

  function removeArtifact(id: string) {
    artifacts.value = artifacts.value.filter(a => a.id !== id)
  }

  function clearAll() {
    artifacts.value = []
  }

  function downloadArtifact(artifact: SandboxArtifact) {
    const link = document.createElement('a')
    if (artifact.url) {
      link.href = artifact.url
    } else if (artifact.content) {
      const blob = new Blob([artifact.content], { type: artifact.mimeType ?? 'text/plain' })
      link.href = URL.createObjectURL(blob)
    }
    link.download = artifact.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return {
    artifacts: readonly(artifacts),
    addArtifact,
    removeArtifact,
    clearAll,
    downloadArtifact,
    formatSize,
  }
}
