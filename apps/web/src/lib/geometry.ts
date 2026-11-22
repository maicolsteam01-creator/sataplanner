import type { PlacedNode, ViewMode } from '../types';

/** Pixeles por foundation a zoom 1. */
export const UNIT = 64;
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

export interface Camera {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  view: ViewMode;
}

export interface Point {
  x: number;
  y: number;
}

export function project(x: number, y: number, view: ViewMode): Point {
  if (view === 'plan') return { x, y };
  return { x: (x - y) * COS30, y: (x + y) * SIN30 };
}

export function unproject(x: number, y: number, view: ViewMode): Point {
  if (view === 'plan') return { x, y };
  return {
    x: (x / COS30 + y / SIN30) / 2,
    y: (y / SIN30 - x / COS30) / 2,
  };
}

export function toScreen(wx: number, wy: number, camera: Camera): Point {
  const p = project(wx, wy, camera.view);
  return {
    x: camera.width / 2 + camera.panX + p.x * UNIT * camera.zoom,
    y: camera.height / 2 + camera.panY + p.y * UNIT * camera.zoom,
  };
}

export function toWorld(sx: number, sy: number, camera: Camera): Point {
  const px = (sx - camera.width / 2 - camera.panX) / (UNIT * camera.zoom);
  const py = (sy - camera.height / 2 - camera.panY) / (UNIT * camera.zoom);
  return unproject(px, py, camera.view);
}

export function snapValue(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function footprintCorners(node: PlacedNode, w: number, d: number): Point[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { x: node.x - hw, y: node.y - hd },
    { x: node.x + hw, y: node.y - hd },
    { x: node.x + hw, y: node.y + hd },
    { x: node.x - hw, y: node.y + hd },
  ];
}

/** Devuelve el nodo mas cercano al punto (en coordenadas de mundo). */
export function hitTest(
  nodes: PlacedNode[],
  world: Point,
  footprints: Map<string, { w: number; d: number }>,
): PlacedNode | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (!node) continue;
    const fp = footprints.get(node.buildingId);
    if (!fp) continue;
    if (
      Math.abs(world.x - node.x) <= fp.w / 2 &&
      Math.abs(world.y - node.y) <= fp.d / 2
    ) {
      return node;
    }
  }
  return null;
}

export function sortByDepth(nodes: PlacedNode[], view: ViewMode): PlacedNode[] {
  return [...nodes].sort((a, b) => {
    if (a.floor !== b.floor) return a.floor - b.floor;
    if (view === 'iso') return a.x + a.y - (b.x + b.y);
    return a.y - b.y || a.x - b.x;
  });
}
