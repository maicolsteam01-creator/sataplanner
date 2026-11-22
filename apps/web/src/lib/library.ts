import type { Doc, Profile } from '../types';

/**
 * Biblioteca local de planos y perfiles. IndexedDB cuando está disponible
 * (más capacidad y sin bloquear el hilo principal) y localStorage como
 * respaldo. Nada sale del dispositivo.
 */

export interface PlanMeta {
  id: string;
  name: string;
  updatedAt: string;
  nodes: number;
  /** Perfil dueño del plano. Los planos antiguos se migran a `local-default`. */
  profileId: string;
  /** Momento en que se generó por primera vez un link/QR de publicación. */
  publishedAt?: string | null;
}

interface StoredPlan {
  meta: PlanMeta;
  doc: Doc;
}

const DB_NAME = 'sataplanner';
const DB_VERSION = 2;
const STORE = 'plans';
const PROFILE_STORE = 'profiles';
const LS_KEY = 'sataplanner.plans.v1';
const PROFILE_LS_KEY = 'sataplanner.profiles.v1';

export const DEFAULT_PROFILE_ID = 'local-default';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'meta.id' });
          if (!db.objectStoreNames.contains(PROFILE_STORE)) {
            db.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

const defaultProfile = (): Profile => ({
  id: DEFAULT_PROFILE_ID,
  name: 'Mi espacio local',
  createdAt: new Date().toISOString(),
  kind: 'local',
});

const metaOf = (doc: Doc, id: string, profileId: string, publishedAt?: string | null): PlanMeta => ({
  id,
  name: doc.meta.name || 'Plano sin título',
  updatedAt: doc.meta.updatedAt || new Date().toISOString(),
  nodes: doc.nodes.length,
  profileId: profileId || DEFAULT_PROFILE_ID,
  publishedAt: publishedAt ?? null,
});

function readFallback(): StoredPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredPlan[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallback(items: StoredPlan[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento lleno: seguimos en memoria */
  }
}

function readProfileFallback(): Profile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROFILE_LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Profile[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProfileFallback(items: Profile[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFILE_LS_KEY, JSON.stringify(items));
  } catch {
    /* ignorar */
  }
}

function putStored(stored: StoredPlan): void {
  void (async () => {
    const db = await openDb();
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).put(stored);
    } catch {
      /* ignorar */
    }
  })();
}

/** Normaliza planos creados antes de existir el concepto de perfil. */
function normalize(stored: StoredPlan): StoredPlan {
  if (stored.meta.profileId && stored.meta.profileId !== 'undefined') return stored;
  const fixed: StoredPlan = {
    ...stored,
    meta: { ...stored.meta, profileId: DEFAULT_PROFILE_ID, publishedAt: stored.meta.publishedAt ?? null },
  };
  putStored(fixed);
  return fixed;
}

export async function listPlans(profileId?: string): Promise<PlanMeta[]> {
  const db = await openDb();
  let items: StoredPlan[];
  if (!db) {
    items = readFallback().map(normalize);
  } else {
    items = await new Promise<StoredPlan[]>((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve((request.result as StoredPlan[]).map(normalize));
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
  return items
    .filter((item) => !profileId || item.meta.profileId === profileId)
    .map((item) => item.meta)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function getStored(id: string): Promise<StoredPlan | null> {
  const db = await openDb();
  if (!db) return readFallback().find((item) => item.meta.id === id) ?? null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredPlan | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePlan(
  doc: Doc,
  id?: string,
  profileId?: string,
  publishedAt?: string | null,
): Promise<PlanMeta | null> {
  const planId = id ?? `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const previous = await getStored(planId);
  const stored: StoredPlan = {
    meta: metaOf(
      doc,
      planId,
      profileId ?? previous?.meta.profileId ?? DEFAULT_PROFILE_ID,
      publishedAt ?? previous?.meta.publishedAt ?? null,
    ),
    doc,
  };
  const db = await openDb();
  if (!db) {
    const items = readFallback().filter((item) => item.meta.id !== planId);
    items.unshift(stored);
    writeFallback(items);
    return stored.meta;
  }
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(stored);
      request.onsuccess = () => resolve(stored.meta);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function markPlanPublished(id: string): Promise<PlanMeta | null> {
  const stored = await getStored(id);
  if (!stored) return null;
  const updated: StoredPlan = {
    ...stored,
    meta: { ...stored.meta, publishedAt: new Date().toISOString() },
  };
  const db = await openDb();
  if (!db) {
    writeFallback(readFallback().map((item) => (item.meta.id === id ? updated : item)));
    return updated.meta;
  }
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(updated);
      request.onsuccess = () => resolve(updated.meta);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadPlan(id: string): Promise<Doc | null> {
  const db = await openDb();
  if (!db) return readFallback().find((item) => item.meta.id === id)?.doc ?? null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredPlan | undefined)?.doc ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deletePlan(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    writeFallback(readFallback().filter((item) => item.meta.id !== id));
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function listProfiles(): Promise<Profile[]> {
  const db = await openDb();
  let profiles: Profile[];
  if (!db) {
    profiles = readProfileFallback();
  } else {
    profiles = await new Promise<Profile[]>((resolve) => {
      try {
        const request = db.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).getAll();
        request.onsuccess = () => resolve(request.result as Profile[]);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
  if (!profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
    const created = defaultProfile();
    profiles = [created, ...profiles];
    void saveProfile(created);
  }
  return profiles.sort((a, b) => {
    if (a.id === DEFAULT_PROFILE_ID) return -1;
    if (b.id === DEFAULT_PROFILE_ID) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await openDb();
  if (!db) {
    const items = readProfileFallback().filter((item) => item.id !== profile.id);
    items.unshift(profile);
    writeProfileFallback(items);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const request = db.transaction(PROFILE_STORE, 'readwrite').objectStore(PROFILE_STORE).put(profile);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function renameProfile(id: string, name: string): Promise<void> {
  const profiles = await listProfiles();
  const profile = profiles.find((item) => item.id === id);
  if (!profile) return;
  await saveProfile({ ...profile, name: name.trim().slice(0, 40) || profile.name });
}
