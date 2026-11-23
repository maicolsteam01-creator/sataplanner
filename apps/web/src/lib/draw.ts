import type { Analysis, DesignIssue } from '@sataplanner/engine';
import { localized, type Building, type GameData } from '@sataplanner/game-data';
import type { Lang, PlacedNode, ViewMode, Wire } from '../types';
import { artFor } from './buildingArt';
import { logoImage, logoKindForBuilding } from './minerLogo';
import {
  clamp,
  footprintCorners,
  sortByDepth,
  toScreen,
  toWorld,
  UNIT,
  type Camera,
} from './geometry';

const C = {
  bg0: '#0B1D2E',
  bg1: '#07131E',
  grid: 'rgba(24, 61, 92, 0.55)',
  gridMajor: 'rgba(40, 96, 138, 0.8)',
  frame: '#2E6E93',
  frameFill: 'rgba(46, 110, 147, 0.06)',
  text: '#E6F3FF',
  muted: '#8AA6BC',
  accent: '#FFB347',
  danger: '#FF6B6B',
  warn: '#FFD166',
  ok: '#7FD1FF',
  panel: 'rgba(8, 21, 33, 0.9)',
};

const LABEL_FONT = '600 11px "JetBrains Mono", ui-monospace, monospace';
const SUB_FONT = '10px "JetBrains Mono", ui-monospace, monospace';

export interface SceneState {
  nodes: PlacedNode[];
  wires: Wire[];
  analysis: Analysis;
  data: GameData;
  buildings: Map<string, Building>;
  selectedId: string | null;
  connectFrom: string | null;
  camera: Camera;
  grid: number;
  frame: number;
  floor: number;
  lang: Lang;
  view: ViewMode;
  /** Dibuja el arte procedural dentro de cada edificio (default: true). */
  art?: boolean;
  /** Resaltado de problemas del Design Check (default: apagado). */
  showIssues?: boolean;
  issues?: DesignIssue[];
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 8) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

export function drawScene(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const { camera } = s;
  const { width, height } = camera;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const bg = ctx.createRadialGradient(
    width / 2,
    height / 2,
    40,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.85,
  );
  bg.addColorStop(0, C.bg0);
  bg.addColorStop(1, C.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, s);
  drawFrame(ctx, s);
  drawWires(ctx, s);
  drawNodes(ctx, s);
  drawIssues(ctx, s);
  drawConnectHint(ctx, s);

  ctx.restore();
}

function worldBounds(camera: Camera): { minX: number; maxX: number; minY: number; maxY: number } {
  const corners = [
    toWorld(0, 0, camera),
    toWorld(camera.width, 0, camera),
    toWorld(0, camera.height, camera),
    toWorld(camera.width, camera.height, camera),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    minX: Math.min(...xs) - 2,
    maxX: Math.max(...xs) + 2,
    minY: Math.min(...ys) - 2,
    maxY: Math.max(...ys) + 2,
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const { camera } = s;
  const bounds = worldBounds(camera);

  let step = s.grid > 0 ? s.grid : 1;
  while (step * UNIT * camera.zoom < 11) step *= 2;

  const estimate = (bounds.maxX - bounds.minX) / step;
  if (estimate > 400) step = (bounds.maxX - bounds.minX) / 400;

  const startX = Math.floor(bounds.minX / step) * step;
  const startY = Math.floor(bounds.minY / step) * step;

  ctx.save();
  ctx.lineWidth = 1;

  let index = 0;
  for (let x = startX; x <= bounds.maxX; x += step) {
    const major = Math.round(x / step) % 4 === 0;
    ctx.strokeStyle = major ? C.gridMajor : C.grid;
    const a = toScreen(x, bounds.minY, camera);
    const b = toScreen(x, bounds.maxY, camera);
    ctx.beginPath();
    ctx.moveTo(Math.round(a.x) + 0.5, a.y);
    ctx.lineTo(Math.round(b.x) + 0.5, b.y);
    ctx.stroke();
    index += 1;
    if (index > 500) break;
  }

  index = 0;
  for (let y = startY; y <= bounds.maxY; y += step) {
    const major = Math.round(y / step) % 4 === 0;
    ctx.strokeStyle = major ? C.gridMajor : C.grid;
    const a = toScreen(bounds.minX, y, camera);
    const b = toScreen(bounds.maxX, y, camera);
    ctx.beginPath();
    ctx.moveTo(a.x, Math.round(a.y) + 0.5);
    ctx.lineTo(b.x, Math.round(b.y) + 0.5);
    ctx.stroke();
    index += 1;
    if (index > 500) break;
  }

  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const half = s.frame / 2;
  const corners = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ].map((p) => toScreen(p.x, p.y, s.camera));

  ctx.save();
  ctx.beginPath();
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = C.frameFill;
  ctx.fill();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = C.frame;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.setLineDash([]);

  // Guías de centrado contra el marco del blueprint.
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.42)';
  ctx.lineWidth = 1;
  const v0 = toScreen(0, -half, s.camera);
  const v1 = toScreen(0, half, s.camera);
  const h0 = toScreen(-half, 0, s.camera);
  const h1 = toScreen(half, 0, s.camera);
  ctx.beginPath();
  ctx.moveTo(v0.x, v0.y);
  ctx.lineTo(v1.x, v1.y);
  ctx.moveTo(h0.x, h0.y);
  ctx.lineTo(h1.x, h1.y);
  ctx.stroke();
  ctx.restore();

  // Cruz central.
  const origin = toScreen(0, 0, s.camera);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(origin.x - 9, origin.y);
  ctx.lineTo(origin.x + 9, origin.y);
  ctx.moveTo(origin.x, origin.y - 9);
  ctx.lineTo(origin.x, origin.y + 9);
  ctx.stroke();
  ctx.restore();

  const label = `${s.frame} × ${s.frame}`;
  ctx.font = SUB_FONT;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const top = corners[0];
  if (top) ctx.fillText(label, top.x + 6, top.y - 6);
  ctx.restore();
}

function drawWires(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const { camera } = s;

  for (const wire of s.wires) {
    const from = byId.get(wire.fromNodeId);
    const to = byId.get(wire.toNodeId);
    if (!from || !to) continue;

    const flow = s.analysis.wires[wire.id];
    const transport = flow?.transportId
      ? s.data.transports.find((t) => t.id === flow.transportId)
      : undefined;
    const pipe = transport?.kind === 'pipe';

    const a = toScreen(from.x, from.y, camera);
    const b = toScreen(to.x, to.y, camera);
    const blocked = flow?.status === 'bottleneck';
    const starved = flow?.status === 'starved';
    const color = blocked ? C.danger : starved ? C.warn : C.ok;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = blocked || starved ? 2.2 : 1.6;
    ctx.globalAlpha = from.floor === s.floor && to.floor === s.floor ? 1 : 0.25;
    if (pipe) ctx.setLineDash([7, 5]);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const startX = a.x + ux * 10;
    const startY = a.y + uy * 10;
    const endX = b.x - ux * 12;
    const endY = b.y - uy * 12;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    const cx = (startX + endX) / 2 - uy * 10;
    const cy = (startY + endY) / 2 + ux * 10;
    ctx.quadraticCurveTo(cx, cy, endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(endY - cy, endX - cx);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 8 * Math.cos(angle - 0.4), endY - 8 * Math.sin(angle - 0.4));
    ctx.lineTo(endX - 8 * Math.cos(angle + 0.4), endY - 8 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    if (flow) {
      const text = `${fmt(flow.rate)}/min`;
      ctx.font = SUB_FONT;
      const textWidth = ctx.measureText(text).width;
      const lx = (startX + endX) / 2;
      const ly = (startY + endY) / 2 - 10;
      ctx.fillStyle = C.panel;
      ctx.beginPath();
      ctx.roundRect(lx - textWidth / 2 - 5, ly - 11, textWidth + 10, 15, 7);
      ctx.fill();
      ctx.fillStyle = blocked ? C.danger : starved ? C.warn : C.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx, ly - 3);
    }

    ctx.restore();
  }
}

function categoryColor(s: SceneState, building: Building): string {
  return s.data.categories.find((c) => c.id === building.category)?.color ?? C.ok;
}

function drawNodes(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const sorted = sortByDepth(s.nodes, s.view);
  const warned = new Set(
    s.analysis.warnings.map((w) => w.nodeId).filter((id): id is string => Boolean(id)),
  );

  for (const node of sorted) {
    const building = s.buildings.get(node.buildingId);
    if (!building) continue;
    const dim = node.floor !== s.floor;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.16;
    if (s.view === 'iso') {
      drawIsoNode(ctx, s, node, building, warned.has(node.id));
    } else {
      drawPlanNode(ctx, s, node, building, warned.has(node.id));
    }
    ctx.restore();
  }
}

function drawPlanNode(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  node: PlacedNode,
  building: Building,
  warning: boolean,
): void {
  const { camera } = s;
  const color = categoryColor(s, building);
  const center = toScreen(node.x, node.y, camera);
  const w = building.footprint.w * UNIT * camera.zoom;
  const d = building.footprint.d * UNIT * camera.zoom;
  const selected = s.selectedId === node.id;
  const x = center.x - w / 2;
  const y = center.y - d / 2;
  const radius = clamp(Math.min(w, d) * 0.16, 4, 10);

  ctx.save();
  if (selected) {
    ctx.shadowColor = C.accent;
    ctx.shadowBlur = 16;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, d, radius);
  ctx.fillStyle = hexToRgba(color, selected ? 0.24 : 0.12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = selected ? C.accent : color;
  ctx.lineWidth = selected ? 2.4 : 1.4;
  ctx.stroke();
  ctx.restore();

  drawBuildingArt(ctx, s, node, building, center.x, center.y, Math.min(w, d) * 0.8);
  drawNodeLabel(ctx, s, node, building, center.x, center.y, Math.min(w, d) - 12, warning);
}

function drawIsoNode(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  node: PlacedNode,
  building: Building,
  warning: boolean,
): void {
  const { camera } = s;
  const color = categoryColor(s, building);
  const selected = s.selectedId === node.id;
  const base = footprintCorners(node, building.footprint.w, building.footprint.d).map((p) =>
    toScreen(p.x, p.y, camera),
  );
  const lift = clamp(building.footprint.h * UNIT * 0.14 * camera.zoom, 4, 44);
  const top = base.map((p) => ({ x: p.x, y: p.y - lift }));

  ctx.save();
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const p0 = base[i];
    const p1 = base[j];
    const t0 = top[i];
    const t1 = top[j];
    if (!p0 || !p1 || !t0 || !t1) continue;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t0.x, t0.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 17, 27, 0.86)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (selected) {
    ctx.shadowColor = C.accent;
    ctx.shadowBlur = 14;
  }
  ctx.beginPath();
  top.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, selected ? 0.28 : 0.14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = selected ? C.accent : color;
  ctx.lineWidth = selected ? 2.2 : 1.4;
  ctx.stroke();
  ctx.restore();

  const cx = top.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = top.reduce((sum, p) => sum + p.y, 0) / 4;
  const size = Math.abs(top[1]!.x - top[0]!.x);
  drawBuildingArt(ctx, s, node, building, cx, cy - lift * 0.12, size * 0.78);
  drawNodeLabel(ctx, s, node, building, cx, cy, size * 0.8, warning);
}

function drawNodeLabel(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  node: PlacedNode,
  building: Building,
  cx: number,
  cy: number,
  maxWidth: number,
  warning: boolean,
): void {
  const production = s.analysis.nodes[node.id];
  const name = localized(building.name, s.lang);
  const title = node.count > 1 ? `${name} ×${node.count}` : name;
  const rate = production?.outputs[0];

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (maxWidth > 52) {
    ctx.font = LABEL_FONT;
    ctx.fillStyle = C.text;
    ctx.fillText(fitText(ctx, title, maxWidth), cx, cy - 6);
  }

  if (maxWidth > 40) {
    ctx.font = SUB_FONT;
    ctx.fillStyle = rate ? C.muted : 'rgba(138, 166, 188, 0.55)';
    const text = rate ? `${fmt(rate.rate)}/min` : `${fmt(production?.power ?? 0)} MW`;
    ctx.fillText(fitText(ctx, text, maxWidth), cx, cy + 8);
  }

  if (node.somersloops > 0 && maxWidth > 40) {
    ctx.fillStyle = C.accent;
    ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('◆'.repeat(Math.min(node.somersloops, 4)), cx, cy + 20);
  }

  if (warning) {
    ctx.beginPath();
    ctx.arc(cx + maxWidth / 2 + 2, cy - 10, 5, 0, Math.PI * 2);
    ctx.fillStyle = C.danger;
    ctx.fill();
    ctx.fillStyle = '#1A0A0A';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.fillText('!', cx + maxWidth / 2 + 2, cy - 10);
  }

  ctx.restore();
}

/** Detalle procedural dentro del edificio; se dibuja detrás de la etiqueta. */
function drawBuildingArt(
  ctx: CanvasRenderingContext2D,
  s: SceneState,
  node: PlacedNode,
  building: Building,
  cx: number,
  cy: number,
  size: number,
): void {
  if (s.art === false || size < 20 || typeof Path2D === 'undefined') return;
  const logoKind = logoKindForBuilding(node.buildingId);
  const icon = logoKind ?? building.icon ?? 'default';
  const shapes = artFor(logoKind ? 'miner' : icon);
  if (!shapes?.length && !logoKind) return;

  const color = categoryColor(s, building);
  const baseAlpha = ctx.globalAlpha;
  const scale = size / 32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const logo = logoKind ? logoImage(logoKind) : null;
  if (logo) {
    const box = 22;
    const ratio = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
    const w = logo.naturalWidth * ratio;
    const h = logo.naturalHeight * ratio;
    ctx.globalAlpha = baseAlpha * 0.92;
    ctx.drawImage(logo, -w / 2, -h / 2, w, h);
    ctx.globalAlpha = baseAlpha;
    ctx.restore();
    return;
  }

  for (const shape of shapes) {
    try {
      const path = new Path2D(shape.path);
      ctx.globalAlpha = baseAlpha * 0.5 * (shape.opacity ?? 1);
      if (shape.fill && shape.fill !== 'none') {
        ctx.fillStyle = shape.fill === 'currentColor' ? color : shape.fill;
        ctx.fill(path);
      }
      if (shape.stroke && shape.stroke !== 'none') {
        ctx.strokeStyle = shape.stroke === 'currentColor' ? color : shape.stroke;
        ctx.lineWidth = (shape.strokeWidth ?? 1.1) / scale;
        ctx.stroke(path);
      }
    } catch {
      /* un path no soportado no debe romper el lienzo */
    }
  }
  ctx.restore();
}

/** Aros y marcadores del Design Check, encima de los nodos y debajo del cursor. */
function drawIssues(ctx: CanvasRenderingContext2D, s: SceneState): void {
  if (!s.showIssues || !s.issues?.length) return;
  const nodes = new Map<string, { errors: number; warnings: number }>();
  const wires = new Set<string>();
  for (const issue of s.issues) {
    if (issue.wireId) wires.add(issue.wireId);
    if (!issue.nodeId) continue;
    const entry = nodes.get(issue.nodeId) ?? { errors: 0, warnings: 0 };
    if (issue.severity === 'error') entry.errors += 1;
    else entry.warnings += 1;
    nodes.set(issue.nodeId, entry);
  }
  if (nodes.size === 0 && wires.size === 0) return;

  const byId = new Map(s.nodes.map((node) => [node.id, node]));
  ctx.save();
  ctx.setLineDash([6, 4]);

  for (const [nodeId, counts] of nodes) {
    const node = byId.get(nodeId);
    const building = node ? s.buildings.get(node.buildingId) : undefined;
    if (!node || !building) continue;
    const color = counts.errors ? C.danger : C.warn;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = node.floor === s.floor ? 1 : 0.35;
    const center = toScreen(node.x, node.y, s.camera);
    const w = building.footprint.w * UNIT * s.camera.zoom;
    const d = building.footprint.d * UNIT * s.camera.zoom;

    ctx.beginPath();
    if (s.view === 'plan') {
      ctx.roundRect(center.x - w / 2 - 5, center.y - d / 2 - 5, w + 10, d + 10, 10);
    } else {
      const r = Math.max(w, d) * 0.62;
      ctx.ellipse(center.x, center.y - 4, r, r * 0.5, 0, 0, Math.PI * 2);
    }
    ctx.stroke();

    const count = counts.errors + counts.warnings;
    const bx = center.x + w / 2 + 10;
    const by = center.y - d / 2 - 8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101820';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.min(count, 9)), bx, by + 0.5);
    ctx.setLineDash([6, 4]);
  }

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  for (const wireId of wires) {
    const wire = s.wires.find((item) => item.id === wireId);
    if (!wire) continue;
    const from = byId.get(wire.fromNodeId);
    const to = byId.get(wire.toNodeId);
    if (!from || !to) continue;
    const a = toScreen(from.x, from.y, s.camera);
    const b = toScreen(to.x, to.y, s.camera);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 16;
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.danger;
    ctx.fill();
    ctx.fillStyle = '#1A0A0A';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', mx, my);
  }
  ctx.restore();
}

function drawConnectHint(ctx: CanvasRenderingContext2D, s: SceneState): void {
  if (!s.connectFrom) return;
  const node = s.nodes.find((n) => n.id === s.connectFrom);
  if (!node) return;
  const building = s.buildings.get(node.buildingId);
  if (!building) return;
  const center = toScreen(node.x, node.y, s.camera);
  const radius = Math.max(building.footprint.w, building.footprint.d) * UNIT * s.camera.zoom * 0.62;

  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
