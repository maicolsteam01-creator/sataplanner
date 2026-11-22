import type { Doc, PlacedNode, Wire } from '../types';

/** Parseo tolerante de planos JSON exportados por la propia app. */

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.slice(0, 120) : fallback;

export function docToJson(doc: Doc): string {
  return JSON.stringify(doc, null, 2);
}

export function parseDocJson(text: string): Doc | null {
  try {
    return normalizeDoc(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function normalizeDoc(value: unknown): Doc | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return null;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.wires)) return null;

  const ids = new Set<string>();
  const nodes: PlacedNode[] = [];
  for (const item of raw.nodes) {
    if (!item || typeof item !== 'object') continue;
    const n = item as Record<string, unknown>;
    const id = str(n.id) || `n_import_${nodes.length}`;
    if (ids.has(id)) continue;
    ids.add(id);
    nodes.push({
      id,
      buildingId: str(n.buildingId),
      recipeId: typeof n.recipeId === 'string' && n.recipeId ? n.recipeId : undefined,
      x: num(n.x),
      y: num(n.y),
      floor: Math.max(0, Math.min(9, Math.round(num(n.floor)))),
      rotation: num(n.rotation),
      count: Math.max(1, Math.round(num(n.count, 1))),
      clock: Math.max(1, Math.min(250, num(n.clock, 100))),
      somersloops: Math.max(0, Math.round(num(n.somersloops))),
      label: typeof n.label === 'string' ? n.label.slice(0, 80) : undefined,
    });
  }

  const wires: Wire[] = [];
  for (const item of raw.wires) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    const fromNodeId = str(w.fromNodeId);
    const toNodeId = str(w.toNodeId);
    if (!ids.has(fromNodeId) || !ids.has(toNodeId)) continue;
    wires.push({
      id: str(w.id) || `w_import_${wires.length}`,
      fromNodeId,
      toNodeId,
      itemId: typeof w.itemId === 'string' && w.itemId ? w.itemId : undefined,
      transportId: typeof w.transportId === 'string' && w.transportId ? w.transportId : undefined,
    });
  }

  const meta = raw.meta && typeof raw.meta === 'object' ? (raw.meta as Record<string, unknown>) : {};
  return {
    schemaVersion: 1,
    gameVersion: str(raw.gameVersion, '1.x'),
    nodes,
    wires,
    meta: {
      name: str(meta.name, 'Plano importado') || 'Plano importado',
      updatedAt: str(meta.updatedAt, new Date().toISOString()) || new Date().toISOString(),
    },
  };
}
