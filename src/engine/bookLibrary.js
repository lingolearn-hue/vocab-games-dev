/**
 * bookLibrary — persistent storage for books opened in the Library reader.
 *
 * Uses IndexedDB rather than localStorage because parsed book text (plus an
 * optional cover image data URL) can easily run into several MB for a full
 * novel, well past localStorage's ~5MB-per-origin quota. IndexedDB has no
 * such practical ceiling for this use case.
 *
 * Each stored record: { id, name, size, title, cover, chapters,
 * lastChapterIndex, addedAt, lastOpenedAt }. `id` is derived from the
 * file's name + byte size, so re-opening the same file (even after a
 * browser restart, when File objects themselves can't be persisted or
 * re-supplied by the browser) is recognized as the same book rather than
 * creating a duplicate entry — this is what makes "persistence" work at
 * all, since the browser only ever hands us a fresh File object each time
 * the person picks one from their device; we can't reach out and re-read
 * it ourselves later. The book's fully parsed content is what's actually
 * persisted, not the original file.
 */

const DB_NAME = 'vocabGamesLibrary'
const DB_VERSION = 1
const STORE = 'books'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
  })
}

/** Deterministic id for a file, used to recognize "the same book" on re-open. */
export function bookIdFor(file) {
  return `${file.name}::${file.size}`
}

/** Save (or update) a parsed book record. */
export async function saveBook(record) {
  await withStore('readwrite', store => store.put(record))
}

/** All stored books, most-recently-opened first. */
export async function listBooks() {
  const all = await withStore('readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  })
  return all.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
}

export async function getBook(id) {
  return withStore('readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function deleteBook(id) {
  await withStore('readwrite', store => store.delete(id))
}

/** Update just the reading-position fields, without rewriting the full text. */
export async function updateProgress(id, { chapterIndex }) {
  const existing = await getBook(id)
  if (!existing) return
  existing.lastChapterIndex = chapterIndex
  existing.lastOpenedAt = Date.now()
  await saveBook(existing)
}
