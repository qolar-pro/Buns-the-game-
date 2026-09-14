/**
 * Save persistence.
 *
 * IndexedDB rather than localStorage: a single explored world already runs to
 * tens of kilobytes per chunk, and localStorage's ~5 MB quota is both small and
 * enforced with an exception that is easy to lose. IndexedDB also stores
 * structured data without a JSON round trip.
 *
 * Saves written by the pre-overhaul build still live in localStorage, so those
 * are read as a fallback and migrated on first load.
 */
import { SaveError, type Save, type SlotSummary } from './schema';

const DB_NAME = 'buns-the-game';
const DB_VERSION = 1;
const STORE = 'saves';
const LEGACY_PREFIX = 'save_';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new SaveError('Could not open save storage.', String(req.error)));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new SaveError('Save storage failed.', String(req.error)));
        t.oncomplete = () => db.close();
      }),
  );
}

interface StoredSave {
  id: string;
  save: Save;
}

export async function writeSlot(id: string, save: Save): Promise<void> {
  await tx('readwrite', (s) => s.put({ id, save } satisfies StoredSave));
}

export async function readSlot(id: string): Promise<Save | null> {
  const row = await tx<StoredSave | undefined>('readonly', (s) => s.get(id));
  if (row?.save) return row.save;

  // Fall back to a pre-overhaul localStorage save under the same name.
  const legacy = readLegacy(id);
  return legacy ?? null;
}

export async function deleteSlot(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function listSlots(): Promise<SlotSummary[]> {
  const rows = await tx<StoredSave[]>('readonly', (s) => s.getAll());
  const summaries: SlotSummary[] = rows
    .filter((r) => r?.save)
    .map((r) => ({
      id: r.id,
      name: r.save.name,
      updatedAt: r.save.updatedAt,
      playtimeMs: r.save.playtimeMs,
      version: r.save.version,
    }));

  // Surface legacy localStorage saves alongside, so nothing looks lost.
  for (const id of legacyIds()) {
    if (summaries.some((s) => s.id === id)) continue;
    summaries.push({ id, name: `${id} (old format)`, updatedAt: 0, playtimeMs: 0, version: 0 });
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

// --- legacy localStorage ----------------------------------------------------

/** Ids of saves written by the pre-overhaul build. */
export function legacyIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_PREFIX)) out.push(key.slice(LEGACY_PREFIX.length));
  }
  return out;
}

/**
 * Raw contents of a legacy save. Returned unmigrated: the caller validates and
 * migrates, so this stays a pure read.
 */
function readLegacy(id: string): Save | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LEGACY_PREFIX + id) ?? localStorage.getItem(id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Save;
  } catch {
    throw new SaveError('That save file could not be read.', 'the stored data is not valid JSON');
  }
}

export function readLegacyRaw(id: string): unknown | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LEGACY_PREFIX + id) ?? localStorage.getItem(id);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new SaveError('That save file could not be read.', 'the stored data is not valid JSON');
  }
}
