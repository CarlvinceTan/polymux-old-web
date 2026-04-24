export interface LocalArtifactMeta {
  id: string
  name: string
  size: number
  contentType: string
  createdAt: string
}

export interface LocalStorageProbe {
  supported: boolean
  persisted: boolean
  usage: number
  quota: number
  full: boolean
}

const DB_NAME = 'polymux-local'
const DB_VERSION = 1
const META_STORE = 'artifacts'
const OPFS_DIR = 'artifacts'
const FULL_RATIO = 0.95

let dbPromise: Promise<IDBDatabase> | null = null
let persistRequested = false

function supportsOpfs(): boolean {
  return import.meta.client
    && typeof navigator !== 'undefined'
    && !!navigator.storage
    && typeof navigator.storage.getDirectory === 'function'
    && typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function txMeta<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(META_STORE, mode)
    const store = tx.objectStore(META_STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(OPFS_DIR, { create: true })
}

async function requestPersistOnce(): Promise<void> {
  if (persistRequested) return
  persistRequested = true
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist()
    }
  }
  catch {
    // best-effort; some browsers prompt, some silently deny — either is fine
  }
}

export function useLocalFileStorage() {
  async function probe(): Promise<LocalStorageProbe> {
    if (!supportsOpfs()) {
      return { supported: false, persisted: false, usage: 0, quota: 0, full: false }
    }
    let persisted = false
    let usage = 0
    let quota = 0
    try {
      if (typeof navigator.storage.persisted === 'function') {
        persisted = await navigator.storage.persisted()
      }
    }
    catch {}
    try {
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate()
        usage = est.usage ?? 0
        quota = est.quota ?? 0
      }
    }
    catch {}
    const full = quota > 0 && usage / quota >= FULL_RATIO
    return { supported: true, persisted, usage, quota, full }
  }

  async function saveArtifact(id: string, blob: Blob, meta: Omit<LocalArtifactMeta, 'id' | 'size' | 'contentType' | 'createdAt'> & Partial<Pick<LocalArtifactMeta, 'createdAt'>>): Promise<LocalArtifactMeta> {
    if (!supportsOpfs()) throw new Error('Local storage is not available in this browser.')
    const dir = await opfsDir()
    const fileHandle = await dir.getFileHandle(id, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    const record: LocalArtifactMeta = {
      id,
      name: meta.name,
      size: blob.size,
      contentType: blob.type || 'application/octet-stream',
      createdAt: meta.createdAt ?? new Date().toISOString(),
    }
    await txMeta(
      'readwrite',
      store => store.put(record) as unknown as IDBRequest<IDBValidKey>,
    )
    void requestPersistOnce()
    return record
  }

  async function readArtifact(id: string): Promise<{ blob: Blob, meta: LocalArtifactMeta } | null> {
    if (!supportsOpfs()) return null
    const meta = await txMeta(
      'readonly',
      store => store.get(id) as IDBRequest<LocalArtifactMeta | undefined>,
    )
    if (!meta) return null
    try {
      const dir = await opfsDir()
      const fileHandle = await dir.getFileHandle(id)
      const file = await fileHandle.getFile()
      return { blob: file, meta }
    }
    catch {
      return null
    }
  }

  async function listArtifacts(): Promise<LocalArtifactMeta[]> {
    if (!supportsOpfs()) return []
    return txMeta(
      'readonly',
      store => store.getAll() as IDBRequest<LocalArtifactMeta[]>,
    )
  }

  async function deleteArtifact(id: string): Promise<void> {
    if (!supportsOpfs()) return
    try {
      const dir = await opfsDir()
      await dir.removeEntry(id)
    }
    catch {}
    await txMeta(
      'readwrite',
      store => store.delete(id) as unknown as IDBRequest<undefined>,
    )
  }

  return {
    probe,
    saveArtifact,
    readArtifact,
    listArtifacts,
    deleteArtifact,
  }
}
