import type { Doc } from '../types';

/**
 * Biblioteca local de planos. IndexedDB cuando está disponible (más capacidad
 * y sin bloquear el hilo principal) y localStorage como respaldo.
 * Nada sale del dispositivo.
 */

export interface PlanMeta {
  id: string;
  name: string;
  updatedAt: string;
  nodes: number;
}

interface StoredPlan {
  meta: PlanMeta;
  doc: Doc;
}

const DB_NAME = 'sataplanner';
const STORE = 'plans';
const LS_KEY = 'sataplanner.plans.v1';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'meta.id' });
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

const metaOf = (doc: Doc, id: string): PlanMeta => ({
  id,
  name: doc.meta.name || 'Plano sin título',
  updatedAt: doc.meta.updatedAt || new Date().toISOString(),
  nodes: doc.nodes.length,
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

export async function listPlans(): Promise<PlanMeta[]> {
  const db = await openDb();
  if (!db) {
    return readFallback()
      .map((item) => item.meta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => {
        const items = (request.result as StoredPlan[]).map((item) => item.meta);
        resolve(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function savePlan(doc: Doc, id?: string): Promise<PlanMeta | null> {
  const planId = id ?? `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const stored: StoredPlan = { meta: metaOf(doc, planId), doc };
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
