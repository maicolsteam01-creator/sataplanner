import { create } from 'zustand';
import type { ProductionPlan } from '@sataplanner/engine';
import { sampleGameData } from '@sataplanner/game-data';
import { detectLang } from './i18n';
import { deletePlan, listPlans, loadPlan, savePlan, type PlanMeta } from './lib/library';
import { planToDoc } from './lib/planAdapter';
import type { Doc, Lang, PlacedNode, Prefs, ViewMode, Wire } from './types';

const DOC_KEY = 'sataplanner.doc.v1';
const PREFS_KEY = 'sataplanner.prefs.v1';
const HISTORY_LIMIT = 60;

const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const now = (): string => new Date().toISOString();

const clampFloor = (floor: number): number => Math.max(0, Math.min(9, Math.round(floor)));

const demoDoc = (): Doc => {
  const smelter: PlacedNode = {
    id: 'n_demo_smelter',
    buildingId: 'smelter',
    recipeId: 'iron-ingot',
    x: -1,
    y: -0.5,
    floor: 0,
    rotation: 0,
    count: 1,
    clock: 100,
    somersloops: 0,
  };
  const constructor: PlacedNode = {
    id: 'n_demo_constructor',
    buildingId: 'constructor',
    recipeId: 'iron-plate',
    x: 1.5,
    y: 0,
    floor: 0,
    rotation: 0,
    count: 1,
    clock: 100,
    somersloops: 0,
  };
  return {
    schemaVersion: 1,
    gameVersion: sampleGameData.gameVersion,
    nodes: [smelter, constructor],
    wires: [{ id: 'w_demo', fromNodeId: smelter.id, toNodeId: constructor.id }],
    meta: { name: 'Plano sin título', updatedAt: now() },
  };
};

const emptyDoc = (): Doc => ({
  schemaVersion: 1,
  gameVersion: sampleGameData.gameVersion,
  nodes: [],
  wires: [],
  meta: { name: 'Plano sin título', updatedAt: now() },
});

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function loadDoc(): Doc {
  const saved = readJson<Doc>(DOC_KEY);
  if (saved?.schemaVersion === 1 && Array.isArray(saved.nodes) && Array.isArray(saved.wires)) {
    return saved;
  }
  return demoDoc();
}

function loadPrefs(): Prefs {
  const saved = readJson<Prefs>(PREFS_KEY);
  return {
    lang: saved?.lang ?? detectLang(),
    view: saved?.view === 'iso' ? 'iso' : 'plan',
    grid: typeof saved?.grid === 'number' ? saved.grid : 1,
    snap: saved?.snap ?? true,
    frame: saved?.frame === 6 ? 6 : 4,
    art: saved?.art ?? true,
    showIssues: saved?.showIssues ?? false,
  };
}

const saveDoc = (doc: Doc): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DOC_KEY, JSON.stringify(doc));
  } catch {
    /* storage lleno o bloqueado: la app sigue funcionando en memoria */
  }
};

const savePrefs = (prefs: Prefs): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignorar */
  }
};

interface Snapshot {
  nodes: PlacedNode[];
  wires: Wire[];
}

export interface AppState extends Prefs {
  doc: Doc;
  selectedId: string | null;
  connectFrom: string | null;
  zoom: number;
  panX: number;
  panY: number;
  centerTick: number;
  floor: number;
  showLeft: boolean;
  showRight: boolean;
  past: Snapshot[];
  future: Snapshot[];
  /** Biblioteca local (IndexedDB) y plano activo. */
  library: PlanMeta[];
  activePlanId: string | null;

  addNode: (buildingId: string, at?: { x: number; y: number }) => void;
  select: (id: string | null) => void;
  pushHistory: () => void;
  moveNode: (id: string, x: number, y: number) => void;
  removeSelected: () => void;
  updateNode: (id: string, patch: Partial<PlacedNode>, history?: boolean) => void;
  startConnect: () => void;
  cancelConnect: () => void;
  connectTo: (targetId: string) => void;
  setView: (view: ViewMode) => void;
  setCamera: (camera: { zoom?: number; panX?: number; panY?: number }) => void;
  setGrid: (grid: number) => void;
  toggleSnap: () => void;
  setFrame: (frame: 4 | 6) => void;
  setFloor: (floor: number) => void;
  setLang: (lang: Lang) => void;
  centerBlueprint: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  undo: () => void;
  redo: () => void;
  resetDoc: () => void;
  renameDoc: (name: string) => void;
  loadExternalDoc: (doc: Doc) => void;

  toggleArt: () => void;
  toggleIssues: () => void;
  refreshLibrary: () => Promise<void>;
  saveCurrentPlan: () => Promise<void>;
  openPlan: (id: string) => Promise<void>;
  removePlan: (id: string) => Promise<void>;
  applyProductionPlan: (plan: ProductionPlan, mode: 'replace' | 'append') => void;
}

const snapshot = (doc: Doc): Snapshot => ({
  nodes: doc.nodes.map((n) => ({ ...n })),
  wires: doc.wires.map((w) => ({ ...w })),
});

export const useAppStore = create<AppState>()((set, get) => {
  const prefs = loadPrefs();
  if (typeof document !== 'undefined') document.documentElement.lang = prefs.lang;

  const persist = (doc: Doc) => saveDoc(doc);

  const commit = () => {
    const state = get();
    set({
      past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshot(state.doc)],
      future: [],
    });
  };

  const patchDoc = (patch: Partial<Doc>) => {
    const base = get().doc;
    const doc: Doc = {
      ...base,
      ...patch,
      meta: { ...base.meta, ...(patch.meta ?? {}), updatedAt: now() },
    };
    set({ doc });
    persist(doc);
  };

  const persistPrefs = () => {
    const { lang, view, grid, snap, frame, art, showIssues } = get();
    savePrefs({ lang, view, grid, snap, frame, art, showIssues });
  };

  const refreshLibrary = async () => {
    set({ library: await listPlans() });
  };

  return {
    ...prefs,
    doc: loadDoc(),
    selectedId: null,
    connectFrom: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    centerTick: 0,
    floor: 0,
    showLeft: typeof window !== 'undefined' ? window.innerWidth >= 940 : true,
    showRight: typeof window !== 'undefined' ? window.innerWidth >= 940 : true,
    past: [],
    future: [],
    library: [],
    activePlanId: null,

    addNode: (buildingId, at) => {
      const building = sampleGameData.buildings.find((b) => b.id === buildingId);
      if (!building) return;
      const state = get();
      commit();
      const n = state.doc.nodes.length;
      const fallback = {
        x: ((n % 5) - 2) * 1.5,
        y: (Math.floor(n / 5) % 4 - 1.5) * 1.5,
      };
      const position = at ?? fallback;
      const recipe =
        sampleGameData.recipes.find((r) => r.buildingIds.includes(buildingId) && !r.alternate) ??
        sampleGameData.recipes.find((r) => r.buildingIds.includes(buildingId));
      const node: PlacedNode = {
        id: uid('n'),
        buildingId,
        recipeId: recipe?.id,
        x: position.x,
        y: position.y,
        floor: 0,
        rotation: 0,
        count: 1,
        clock: 100,
        somersloops: 0,
      };
      patchDoc({ nodes: [...state.doc.nodes, node] });
      set({ selectedId: node.id, connectFrom: null });
    },

    select: (id) => set({ selectedId: id, connectFrom: id ? get().connectFrom : null }),

    pushHistory: () => commit(),

    moveNode: (id, x, y) => {
      const state = get();
      patchDoc({
        nodes: state.doc.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
      });
    },

    removeSelected: () => {
      const state = get();
      const id = state.selectedId;
      if (!id) return;
      commit();
      patchDoc({
        nodes: state.doc.nodes.filter((n) => n.id !== id),
        wires: state.doc.wires.filter((w) => w.fromNodeId !== id && w.toNodeId !== id),
      });
      set({ selectedId: null, connectFrom: null });
    },

    updateNode: (id, patch, history = true) => {
      const state = get();
      if (history) commit();
      patchDoc({
        nodes: state.doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      });
    },

    startConnect: () => {
      const id = get().selectedId;
      if (id) set({ connectFrom: id });
    },

    cancelConnect: () => set({ connectFrom: null }),

    connectTo: (targetId) => {
      const state = get();
      const from = state.connectFrom;
      if (!from || from === targetId) {
        set({ connectFrom: null });
        return;
      }
      const duplicate = state.doc.wires.some(
        (w) => w.fromNodeId === from && w.toNodeId === targetId,
      );
      if (duplicate) {
        set({ connectFrom: null });
        return;
      }
      commit();
      patchDoc({
        wires: [...state.doc.wires, { id: uid('w'), fromNodeId: from, toNodeId: targetId }],
      });
      set({ connectFrom: null, selectedId: targetId });
    },

    setView: (view) => {
      set({ view });
      persistPrefs();
    },

    setCamera: (camera) => set(camera),

    setGrid: (grid) => {
      set({ grid });
      persistPrefs();
    },

    toggleSnap: () => {
      set({ snap: !get().snap });
      persistPrefs();
    },

    setFrame: (frame) => {
      set({ frame });
      persistPrefs();
    },

    setFloor: (floor) => set({ floor: clampFloor(floor) }),

    setLang: (lang) => {
      set({ lang });
      if (typeof document !== 'undefined') document.documentElement.lang = lang;
      persistPrefs();
    },

    centerBlueprint: () => set({ centerTick: get().centerTick + 1, panX: 0, panY: 0 }),

    toggleLeft: () => set({ showLeft: !get().showLeft }),
    toggleRight: () => set({ showRight: !get().showRight }),

    undo: () => {
      const state = get();
      const previous = state.past[state.past.length - 1];
      if (!previous) return;
      const current = snapshot(state.doc);
      const doc: Doc = {
        ...state.doc,
        nodes: previous.nodes,
        wires: previous.wires,
        meta: { ...state.doc.meta, updatedAt: now() },
      };
      set({
        doc,
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, HISTORY_LIMIT),
        selectedId: null,
        connectFrom: null,
      });
      persist(doc);
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      const current = snapshot(state.doc);
      const doc: Doc = {
        ...state.doc,
        nodes: next.nodes,
        wires: next.wires,
        meta: { ...state.doc.meta, updatedAt: now() },
      };
      set({
        doc,
        future: state.future.slice(1),
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        selectedId: null,
        connectFrom: null,
      });
      persist(doc);
    },

    resetDoc: () => {
      commit();
      const doc = emptyDoc();
      set({ doc, selectedId: null, connectFrom: null });
      persist(doc);
    },

    renameDoc: (name) => {
      const clean = name.trim().slice(0, 80);
      patchDoc({ meta: { ...get().doc.meta, name: clean || 'Plano sin título' } });
    },

    loadExternalDoc: (incoming) => {
      const state = get();
      set({
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshot(state.doc)],
        future: [],
        doc: incoming,
        selectedId: null,
        connectFrom: null,
      });
      persist(incoming);
    },

    toggleArt: () => {
      set({ art: !get().art });
      persistPrefs();
    },

    toggleIssues: () => {
      set({ showIssues: !get().showIssues });
      persistPrefs();
    },

    refreshLibrary,

    saveCurrentPlan: async () => {
      const state = get();
      const meta = await savePlan(state.doc, state.activePlanId ?? undefined);
      if (meta) set({ activePlanId: meta.id });
      await refreshLibrary();
    },

    openPlan: async (id) => {
      const doc = await loadPlan(id);
      if (!doc) return;
      get().loadExternalDoc(doc);
      set({ activePlanId: id, centerTick: get().centerTick + 1, panX: 0, panY: 0 });
    },

    removePlan: async (id) => {
      await deletePlan(id);
      if (get().activePlanId === id) set({ activePlanId: null });
      await refreshLibrary();
    },

    applyProductionPlan: (plan, mode) => {
      const state = get();
      const generated = planToDoc(plan, {
        frame: state.frame,
        floor: state.floor,
        name: state.doc.meta.name,
        idPrefix: uid('gen'),
      });
      const base = mode === 'replace' ? { nodes: [], wires: [] } : state.doc;
      commit();
      patchDoc({
        nodes: [...base.nodes, ...generated.nodes],
        wires: [...base.wires, ...generated.wires],
      });
      set({
        selectedId: null,
        connectFrom: null,
        centerTick: get().centerTick + 1,
        panX: 0,
        panY: 0,
      });
    },
  };
});

// La biblioteca se carga en segundo plano al iniciar.
if (typeof window !== 'undefined') {
  void useAppStore.getState().refreshLibrary();
}
