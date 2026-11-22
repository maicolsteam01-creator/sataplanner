export type ViewMode = 'plan' | 'iso';
export type Lang = 'es' | 'en' | 'ja';

export interface PlacedNode {
  id: string;
  buildingId: string;
  recipeId?: string;
  /** Centro del edificio, en foundations. */
  x: number;
  y: number;
  floor: number;
  /** Rotacion en grados: 0 | 90 | 180 | 270 */
  rotation: number;
  count: number;
  clock: number;
  somersloops: number;
  label?: string;
}

export interface Wire {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  itemId?: string;
  transportId?: string;
}

export interface Doc {
  schemaVersion: 1;
  gameVersion: string;
  nodes: PlacedNode[];
  wires: Wire[];
  meta: {
    name: string;
    updatedAt: string;
  };
}

export interface Prefs {
  lang: Lang;
  view: ViewMode;
  grid: number;
  snap: boolean;
  frame: 4 | 6;
  /** Arte procedural en el lienzo (se puede desactivar). */
  art?: boolean;
  /** Resaltar los problemas del Design Check en el lienzo. */
  showIssues?: boolean;
}
