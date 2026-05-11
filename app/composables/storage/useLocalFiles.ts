// Per-device, per-workspace file storage. Used when a workspace file row has
// `backend='local'`: the authoritative metadata row lives on the server, but
// the bytes live only here (IndexedDB + OPFS) on this browser.
//
// Keys:
//  - IDB: compound string `{workspaceId}:{fileId}` → metadata row.
//  - OPFS: `workspace_files/{workspaceId}/{fileId}` → blob bytes.

export interface LocalFileMeta {
  key: string             // `{workspaceId}:{fileId}`
  workspaceId: string
  fileId: string
  path: string            // logical workspace path (for UI/diagnostics)
  contentType: string | null
  size: number
  savedAt: string
}

const DB_NAME = 'polymux-local-workspace-files'
const DB_VERSION = 1
const META_STORE = 'meta'
const OPFS_ROOT = 'workspace_files'

let dbPromise: Promise<IDBDatabase> | null = null

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
        const store = db.createObjectStore(META_STORE, { keyPath: 'key' })
        store.createIndex('by_workspace', 'workspaceId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function compoundKey(workspaceId: string, fileId: string): string {
  return `${workspaceId}:${fileId}`
}

async function workspaceDir(workspaceId: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsOpfs()) return null
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(OPFS_ROOT, { create })
  return dir.getDirectoryHandle(workspaceId, { create })
}

async function writeBytes(workspaceId: string, fileId: string, blob: Blob): Promise<void> {
  const dir = await workspaceDir(workspaceId, true)
  if (!dir) throw new Error('LOCAL_STORAGE_UNSUPPORTED')
  const handle = await dir.getFileHandle(fileId, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

async function readBytes(workspaceId: string, fileId: string): Promise<Blob | null> {
  const dir = await workspaceDir(workspaceId, false)
  if (!dir) return null
  try {
    const handle = await dir.getFileHandle(fileId, { create: false })
    const file = await handle.getFile()
    return file
  }
  catch (err) {
    // Most common cause is NotFoundError — caller treats that as "not here."
    if ((err as { name?: string }).name === 'NotFoundError') return null
    throw err
  }
}

async function deleteBytes(workspaceId: string, fileId: string): Promise<void> {
  const dir = await workspaceDir(workspaceId, false)
  if (!dir) return
  try {
    await dir.removeEntry(fileId)
  }
  catch (err) {
    if ((err as { name?: string }).name !== 'NotFoundError') throw err
  }
}

async function txMeta<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | undefined> {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(META_STORE, mode)
    const store = tx.objectStore(META_STORE)
    const req = fn(store)
    if (!req) {
      tx.oncomplete = () => resolve(undefined)
      tx.onerror = () => reject(tx.error)
      return
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function useLocalFiles() {
  async function write(
    workspaceId: string,
    fileId: string,
    blob: Blob,
    meta: { path: string; contentType: string | null; size: number },
  ): Promise<void> {
    if (!supportsOpfs()) throw new Error('LOCAL_STORAGE_UNSUPPORTED')
    await writeBytes(workspaceId, fileId, blob)
    const row: LocalFileMeta = {
      key: compoundKey(workspaceId, fileId),
      workspaceId,
      fileId,
      path: meta.path,
      contentType: meta.contentType,
      size: meta.size,
      savedAt: new Date().toISOString(),
    }
    await txMeta('readwrite', store => store.put(row))
  }

  async function read(workspaceId: string, fileId: string): Promise<{ blob: Blob; meta: LocalFileMeta } | null> {
    const blob = await readBytes(workspaceId, fileId)
    if (!blob) return null
    const meta = await txMeta<LocalFileMeta>('readonly', store => store.get(compoundKey(workspaceId, fileId)))
    if (!meta) {
      // Bytes exist but metadata was lost — synthesise a minimal record so
      // the caller can still consume the blob.
      return {
        blob,
        meta: {
          key: compoundKey(workspaceId, fileId),
          workspaceId,
          fileId,
          path: '',
          contentType: blob.type || null,
          size: blob.size,
          savedAt: new Date().toISOString(),
        },
      }
    }
    return { blob, meta }
  }

  async function remove(workspaceId: string, fileId: string): Promise<void> {
    await deleteBytes(workspaceId, fileId)
    await txMeta('readwrite', store => store.delete(compoundKey(workspaceId, fileId)))
  }

  async function has(workspaceId: string, fileId: string): Promise<boolean> {
    const blob = await readBytes(workspaceId, fileId)
    return !!blob
  }

  async function listWorkspace(workspaceId: string): Promise<LocalFileMeta[]> {
    const db = await openDb()
    return new Promise<LocalFileMeta[]>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly')
      const store = tx.objectStore(META_STORE)
      const index = store.index('by_workspace')
      const req = index.getAll(workspaceId)
      req.onsuccess = () => resolve((req.result ?? []) as LocalFileMeta[])
      req.onerror = () => reject(req.error)
    })
  }

  return {
    supported: supportsOpfs,
    write,
    read,
    remove,
    has,
    listWorkspace,
  }
}
