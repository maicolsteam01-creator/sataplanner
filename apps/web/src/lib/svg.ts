import type { Analysis } from '@sataplanner/engine';
import { localized, type Building, type GameData } from '@sataplanner/game-data';
import type { Doc, Lang, ViewMode } from '../types';
import { footprintCorners, project, sortByDepth } from './geometry';
import { logoDataUrl, logoKindForBuilding } from './minerLogo';

/**
 * Genera un plano tecnico vectorial, independiente del canvas de pantalla.
 * El mismo SVG se usa para exportar SVG, rasterizar PNG y armar el PDF.
 */

const SHEET_W = 1680;
const SHEET_H = 1180;
const M = 32;
const HEADER_H = 56;
const TITLE_H = 200;
const BOM_W = 340;

const DRAW = {
  x: M,
  y: M + HEADER_H,
  w: SHEET_W - M * 2 - BOM_W - 24,
  h: SHEET_H - M * 2 - HEADER_H - TITLE_H - 20 - 44,
};

const COL = {
  bg: '#081724',
  panel: '#0B2133',
  line: '#1C4666',
  lineSoft: '#14374F',
  text: '#E6F3FF',
  muted: '#8AA6BC',
  dim: '#587791',
  accent: '#7FD1FF',
  amber: '#FFB347',
  danger: '#FF6B6B',
  warn: '#FFD166',
  ok: '#5BE49B',
};

const MONO = "Consolas, 'Courier New', ui-monospace, monospace";
const SANS = "'Segoe UI', Inter, system-ui, sans-serif";

const FOUNDATION_METERS = 8;

export interface BlueprintInput {
  doc: Doc;
  analysis: Analysis;
  data: GameData;
  buildings: Map<string, Building>;
  lang: Lang;
  view: ViewMode;
  frame: number;
  floor: number;
}

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
};

const clipText = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;

type TextOpts = {
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
  family?: string;
  spacing?: number;
  opacity?: number;
};

const text = (x: number, y: number, content: string, o: TextOpts = {}): string => {
  const size = o.size ?? 12;
  const fill = o.fill ?? COL.text;
  const anchor = o.anchor ?? 'start';
  const weight = o.weight ?? 400;
  const family = o.family ?? MONO;
  const spacing = o.spacing ? ` letter-spacing="${o.spacing}"` : '';
  const opacity = o.opacity !== undefined ? ` opacity="${o.opacity}"` : '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle"${spacing}${opacity}>${esc(content)}</text>`;
};

const line = (x1: number, y1: number, x2: number, y2: number, stroke = COL.line, width = 1, dash?: string): string =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;

function labels(lang: Lang) {
  if (lang === 'en') {
    return {
      sheet: 'BLUEPRINT SHEET',
      title: 'TITLE',
      game: 'GAME VERSION',
      view: 'VIEW',
      plan: 'PLAN',
      iso: 'ISOMETRIC',
      scale: 'SCALE',
      foundation: '1 foundation = 8 m',
      units: 'foundations',
      nodes: 'NODES',
      machines: 'MACHINES',
      power: 'POWER',
      generation: 'GEN',
      date: 'DATE',
      schedule: 'MACHINE SCHEDULE',
      bom: 'EXTERNAL INPUTS',
      alerts: 'ALERTS',
      total: 'TOTAL',
      more: 'more',
      ok: 'ok',
      bottleneck: 'overload',
      starved: 'starved',
      empty: 'Empty plan',
      floor: 'FLOOR',
      disclaimer: 'Fan tool. Not affiliated with Coffee Stain Studios.',
      noAlerts: 'none',
    };
  }
  if (lang === 'ja') {
    return {
      sheet: 'ブループリント図面',
      title: '図面名',
      game: 'ゲーム版',
      view: 'ビュー',
      plan: '平面',
      iso: 'アイソメ',
      scale: '縮尺',
      foundation: '1 ファウンデーション = 8 m',
      units: 'ファウンデーション',
      nodes: 'ノード',
      machines: '台数',
      power: '電力',
      generation: '発電',
      date: '日付',
      schedule: '機械一覧',
      bom: '外部投入',
      alerts: '警告',
      total: '合計',
      more: '件',
      ok: '正常',
      bottleneck: '過負荷',
      starved: '不足',
      empty: '空のプラン',
      floor: '階',
      disclaimer: 'ファンツールです。Coffee Stain Studios とは無関係です。',
      noAlerts: 'なし',
    };
  }
  return {
    sheet: 'PLANO TÉCNICO',
    title: 'TÍTULO',
    game: 'VERSIÓN DEL JUEGO',
    view: 'VISTA',
    plan: 'PLANTA',
    iso: 'ISOMÉTRICA',
    scale: 'ESCALA',
    foundation: '1 foundation = 8 m',
    units: 'fundaciones',
    nodes: 'NODOS',
    machines: 'MÁQUINAS',
    power: 'ENERGÍA',
    generation: 'GEN',
    date: 'FECHA',
    schedule: 'LISTADO DE MÁQUINAS',
    bom: 'INSUMOS EXTERNOS',
    alerts: 'ALERTAS',
    total: 'TOTAL',
    more: 'más',
    ok: 'ok',
    bottleneck: 'sobrecarga',
    starved: 'sin stock',
    empty: 'Plano vacío',
    floor: 'PISO',
    disclaimer: 'Herramienta de fans. No afiliada a Coffee Stain Studios.',
    noAlerts: 'ninguna',
  };
}

export function buildBlueprintSvg(input: BlueprintInput): string {
  const { doc, analysis, data, buildings, lang, view, frame, floor } = input;
  const L = labels(lang);
  const half = frame / 2;

  const ordered = sortByDepth(doc.nodes, view);
  const refs = new Map<string, string>();
  ordered.forEach((node, index) => refs.set(node.id, `B${index + 1}`));

  const framePts = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ].map((p) => project(p.x, p.y, view));

  const points = [...framePts];
  for (const node of doc.nodes) {
    const building = buildings.get(node.buildingId);
    if (!building) continue;
    for (const corner of footprintCorners(node, building.footprint.w, building.footprint.d)) {
      points.push(project(corner.x, corner.y, view));
    }
  }

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  const pad = 34;

  const scale = Math.min((DRAW.w - pad * 2) / spanX, (DRAW.h - pad * 2) / spanY);
  const offsetX = DRAW.x + (DRAW.w - spanX * scale) / 2;
  const offsetY = DRAW.y + (DRAW.h - spanY * scale) / 2;
  const map = (p: { x: number; y: number }) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  });
  const world = (x: number, y: number) => map(project(x, y, view));

  const frameScreen = framePts.map(map);
  const framePath = `M ${frameScreen.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`;

  const now = new Date();
  const dateText = now.toISOString().slice(0, 10);
  const nodeCount = doc.nodes.length;
  const machineCount = doc.nodes.reduce((sum, n) => sum + Math.max(1, n.count), 0);
  const balance = analysis.powerGeneration - analysis.powerConsumption;

  const totalOutputs = Object.values(analysis.nodes)
    .flatMap((n) => n.outputs)
    .reduce((sum, flow) => sum + flow.rate, 0);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="${esc(doc.meta.name)}">`,
  );

  // Fondo y textura de plano.
  out.push('<defs>');
  out.push(
    `<pattern id="gridPattern" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${COL.lineSoft}" stroke-width="0.6" opacity="0.35" /></pattern>`,
  );
  out.push(
    `<pattern id="microGrid" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M6 0H0V6" fill="none" stroke="${COL.lineSoft}" stroke-width="0.4" opacity="0.18" /></pattern>`,
  );
  out.push(`<clipPath id="frameClip"><path d="${framePath}" /></clipPath>`);
  out.push('</defs>');

  out.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${COL.bg}" />`);
  out.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="url(#gridPattern)" />`);
  out.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="url(#microGrid)" />`);

  // Marco de la hoja.
  out.push(`<rect x="${M / 2}" y="${M / 2}" width="${SHEET_W - M}" height="${SHEET_H - M}" fill="none" stroke="${COL.line}" stroke-width="1.5" />`);
  out.push(`<rect x="${M / 2 + 6}" y="${M / 2 + 6}" width="${SHEET_W - M - 12}" height="${SHEET_H - M - 12}" fill="none" stroke="${COL.lineSoft}" stroke-width="0.8" />`);

  // Cabecera.
  out.push(text(M, M + 30, 'SataPlanner', { size: 24, weight: 700, fill: COL.text, family: SANS, spacing: 1 }));
  out.push(text(M + 170, M + 31, `// ${L.sheet}`, { size: 11, fill: COL.accent, spacing: 3 }));
  out.push(text(SHEET_W - M, M + 30, `REV 0.1 · ${dateText}`, { size: 10, fill: COL.dim, anchor: 'end', spacing: 1.5 }));
  out.push(line(M, M + 46, SHEET_W - M, M + 46, COL.line, 1));

  // Plano: rejilla, marco y guias de centrado.
  out.push(`<g clip-path="url(#frameClip)">`);
  const step = 1;
  const gridStart = -half;
  for (let v = gridStart; v <= half + 0.001; v += step) {
    const a1 = world(v, -half);
    const b1 = world(v, half);
    const major = Math.abs(v % 4) < 0.001;
    out.push(line(a1.x, a1.y, b1.x, b1.y, major ? COL.line : COL.lineSoft, major ? 1 : 0.7));
    const a2 = world(-half, v);
    const b2 = world(half, v);
    out.push(line(a2.x, a2.y, b2.x, b2.y, major ? COL.line : COL.lineSoft, major ? 1 : 0.7));
  }

  // Ejes centrales.
  const c0 = world(0, -half);
  const c1 = world(0, half);
  const c2 = world(-half, 0);
  const c3 = world(half, 0);
  out.push(line(c0.x, c0.y, c1.x, c1.y, COL.amber, 0.9, '10 6'));
  out.push(line(c2.x, c2.y, c3.x, c3.y, COL.amber, 0.9, '10 6'));
  out.push(`</g>`);

  out.push(`<path d="${framePath}" fill="rgba(127, 209, 255, 0.035)" stroke="${COL.accent}" stroke-width="1.6" stroke-dasharray="12 8" />`);

  // Etiqueta del marco y dimension.
  const topLeft = frameScreen[0];
  const topRight = frameScreen[1];
  if (topLeft && topRight) {
    const midX = (topLeft.x + topRight.x) / 2;
    const midY = (topLeft.y + topRight.y) / 2;
    out.push(text(midX, midY - 14, `${frame} × ${frame} ${L.units}`, { size: 11, fill: COL.dim, anchor: 'middle', spacing: 1 }));
  }

  // Wires.
  for (const wire of doc.wires) {
    const from = doc.nodes.find((n) => n.id === wire.fromNodeId);
    const to = doc.nodes.find((n) => n.id === wire.toNodeId);
    if (!from || !to) continue;
    const flow = analysis.wires[wire.id];
    const a = world(from.x, from.y);
    const b = world(to.x, to.y);

    const color =
      flow?.status === 'bottleneck' ? COL.danger : flow?.status === 'starved' ? COL.warn : COL.accent;
    const transport = flow?.transportId ? data.transports.find((tr) => tr.id === flow.transportId) : undefined;
    const dashed = transport?.kind === 'pipe';

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const startX = a.x + ux * 9;
    const startY = a.y + uy * 9;
    const endX = b.x - ux * 11;
    const endY = b.y - uy * 11;
    const cx = (startX + endX) / 2 - uy * 9;
    const cy = (startY + endY) / 2 + ux * 9;

    out.push(
      `<path d="M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${flow?.status === 'ok' ? 1.5 : 2.2}"${dashed ? ' stroke-dasharray="8 5"' : ''} />`,
    );

    const angle = Math.atan2(endY - cy, endX - cx);
    const ax = endX - 9 * Math.cos(angle);
    const ay = endY - 9 * Math.sin(angle);
    out.push(
      `<path d="M ${endX.toFixed(1)} ${endY.toFixed(1)} L ${(ax - 4 * Math.sin(angle)).toFixed(1)} ${(ay + 4 * Math.cos(angle)).toFixed(1)} L ${(ax + 4 * Math.sin(angle)).toFixed(1)} ${(ay - 4 * Math.cos(angle)).toFixed(1)} Z" fill="${color}" />`,
    );

    if (flow) {
      const label = `${fmt(flow.rate)}/min`;
      const lx = (startX + endX) / 2;
      const ly = (startY + endY) / 2 - 10;
      const w = label.length * 6.1 + 10;
      out.push(
        `<rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - 9).toFixed(1)}" width="${w.toFixed(1)}" height="17" rx="8" fill="${COL.panel}" stroke="${COL.lineSoft}" stroke-width="0.8" />`,
      );
      out.push(text(lx, ly, label, { size: 10, fill: color, anchor: 'middle' }));
    }
  }

  // Nodos.
  const warned = new Set(
    analysis.warnings.map((w) => w.nodeId).filter((id): id is string => Boolean(id)),
  );

  for (const node of ordered) {
    const building = buildings.get(node.buildingId);
    if (!building) continue;
    const production = analysis.nodes[node.id];
    const color =
      data.categories.find((c) => c.id === building.category)?.color ?? COL.accent;
    const dim = node.floor !== floor;
    const ref = refs.get(node.id) ?? '';
    const corners = footprintCorners(node, building.footprint.w, building.footprint.d).map((p) =>
      map(project(p.x, p.y, view)),
    );

    out.push(`<g${dim ? ' opacity="0.28"' : ''}>`);

    if (view === 'plan') {
      const x0 = Math.min(...corners.map((c) => c.x));
      const x1 = Math.max(...corners.map((c) => c.x));
      const y0 = Math.min(...corners.map((c) => c.y));
      const y1 = Math.max(...corners.map((c) => c.y));
      out.push(
        `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" rx="4" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.6" />`,
      );
    } else {
      const lift = Math.min(46, Math.max(6, building.footprint.h * scale * 0.22));
      const top = corners.map((p) => ({ x: p.x, y: p.y - lift }));
      const faces = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ];
      for (const [i, j] of faces) {
        const p0 = corners[i];
        const p1 = corners[j];
        const t0 = top[i];
        const t1 = top[j];
        if (!p0 || !p1 || !t0 || !t1) continue;
        out.push(
          `<path d="M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${t1.x.toFixed(1)} ${t1.y.toFixed(1)} L ${t0.x.toFixed(1)} ${t0.y.toFixed(1)} Z" fill="${COL.panel}" fill-opacity="0.9" stroke="${color}" stroke-opacity="0.4" stroke-width="1" />`,
        );
      }
      out.push(
        `<path d="M ${top.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.6" />`,
      );
    }

    const cx = corners.reduce((sum, c) => sum + c.x, 0) / 4;
    const cy = corners.reduce((sum, c) => sum + c.y, 0) / 4 - (view === 'iso' ? 18 : 0);
    const size = Math.min(
      Math.max(...corners.map((c) => c.x)) - Math.min(...corners.map((c) => c.x)),
      Math.max(...corners.map((c) => c.y)) - Math.min(...corners.map((c) => c.y)),
    );

    const logoKind = logoKindForBuilding(node.buildingId);
    if (logoKind) {
      const logoUrl = logoDataUrl(logoKind);
      const logoSize = Math.min(size * 0.46, 34);
      const lx = (cx - logoSize / 2).toFixed(1);
      const ly = (cy - 8 - logoSize / 2).toFixed(1);
      out.push(
        `<image href="${logoUrl}" xlink:href="${logoUrl}" x="${lx}" y="${ly}" width="${logoSize.toFixed(1)}" height="${logoSize.toFixed(1)}" preserveAspectRatio="xMidYMid meet" opacity="0.9" />`,
      );
    }

    if (size > 54) {
      out.push(
        text(cx, cy - 7, clipText(localized(building.name, lang), Math.floor(size / 7)), {
          size: 12,
          weight: 600,
          anchor: 'middle',
          family: SANS,
          fill: COL.text,
        }),
      );
      const rate = production?.outputs[0];
      if (rate) {
        out.push(text(cx, cy + 9, `${fmt(rate.rate)}/min`, { size: 10, fill: COL.muted, anchor: 'middle' }));
      } else if (production) {
        out.push(text(cx, cy + 9, `${fmt(production.power)} MW`, { size: 10, fill: COL.muted, anchor: 'middle' }));
      }
      if (node.count > 1 || Math.round(node.clock) !== 100) {
        out.push(
          text(cx, cy + 22, `×${node.count}${Math.round(node.clock) !== 100 ? ` · ${Math.round(node.clock)}%` : ''}`, {
            size: 9,
            fill: COL.amber,
            anchor: 'middle',
          }),
        );
      }
    } else {
      out.push(text(cx, cy, `×${node.count}`, { size: 10, fill: COL.amber, anchor: 'middle' }));
    }

    // Referencia B1/B2 y alerta.
    const bx = Math.min(...corners.map((c) => c.x));
    const by = Math.min(...corners.map((c) => c.y));
    out.push(
      `<rect x="${(bx - 1).toFixed(1)}" y="${(by - 15).toFixed(1)}" width="${(ref.length * 7 + 10).toFixed(1)}" height="15" rx="3" fill="${COL.panel}" stroke="${COL.line}" stroke-width="0.8" />`,
    );
    out.push(text(bx + 4, by - 7, ref, { size: 9, fill: COL.accent, spacing: 1 }));

    if (warned.has(node.id)) {
      out.push(`<circle cx="${(bx + ref.length * 7 + 12).toFixed(1)}" cy="${(by - 7).toFixed(1)}" r="4.5" fill="${COL.danger}" />`);
      out.push(text(bx + ref.length * 7 + 12, by - 6, '!', { size: 7, weight: 700, fill: '#1A0A0A', anchor: 'middle', family: SANS }));
    }

    out.push('</g>');
  }

  if (doc.nodes.length === 0) {
    out.push(text(DRAW.x + DRAW.w / 2, DRAW.y + DRAW.h / 2, L.empty, { size: 18, fill: COL.dim, anchor: 'middle', family: SANS }));
  }

  // Leyenda de estados y barra de escala en la franja inferior.
  const legendY = DRAW.y + DRAW.h + 26;
  const legend: Array<[string, string]> = [
    [COL.ok, L.ok],
    [COL.danger, L.bottleneck],
    [COL.warn, L.starved],
  ];
  let legendX = DRAW.x + 6;
  for (const [color, label] of legend) {
    out.push(line(legendX, legendY, legendX + 16, legendY, color, 2.4));
    out.push(text(legendX + 22, legendY, label, { size: 9, fill: COL.dim }));
    legendX += 22 + label.length * 6 + 22;
  }
  if (doc.nodes.length > 0) {
    out.push(text(legendX + 6, legendY, `${L.floor} ${floor}`, { size: 9, fill: COL.dim }));
  }

  if (view === 'plan') {
    const barRight = DRAW.x + DRAW.w;
    const units = [8, 4, 2, 1].find((n) => n * scale <= 320) ?? 1;
    const barW = units * scale;
    const barX = barRight - barW;
    out.push(line(barX, legendY, barRight, legendY, COL.muted, 1.4));
    for (let i = 0; i <= units; i += 1) {
      const px = barX + i * scale;
      out.push(line(px, legendY - 5, px, legendY + 5, COL.muted, 1.2));
    }
    out.push(
      text(barX + barW / 2, legendY + 16, `${units} × ${FOUNDATION_METERS} m`, {
        size: 9,
        fill: COL.dim,
        anchor: 'middle',
      }),
    );
  }

  // ---------- Columna derecha: listado de maquinas + BOM ----------
  const colX = DRAW.x + DRAW.w + 24;
  const scheduleTop = DRAW.y;
  const maxRows = 9;
  const rows = ordered.slice(0, maxRows);
  const scheduleHeight = 42 + rows.length * 42 + (ordered.length > maxRows ? 24 : 8);

  out.push(
    `<rect x="${colX}" y="${scheduleTop}" width="${BOM_W}" height="${scheduleHeight}" rx="4" fill="${COL.panel}" fill-opacity="0.55" stroke="${COL.line}" stroke-width="1" />`,
  );
  out.push(text(colX + 12, scheduleTop + 20, L.schedule, { size: 10, fill: COL.accent, spacing: 2 }));
  out.push(line(colX + 12, scheduleTop + 32, colX + BOM_W - 12, scheduleTop + 32, COL.lineSoft, 1));

  rows.forEach((node, index) => {
    const building = buildings.get(node.buildingId);
    if (!building) return;
    const production = analysis.nodes[node.id];
    const y = scheduleTop + 50 + index * 42;
    const ref = refs.get(node.id) ?? '';
    out.push(text(colX + 12, y, ref, { size: 10, fill: COL.accent, weight: 600 }));
    out.push(
      text(colX + 44, y, clipText(`${localized(building.name, lang)} ×${node.count}`, 30), {
        size: 11,
        fill: COL.text,
        family: SANS,
        weight: 600,
      }),
    );
    const rate = production?.outputs[0];
    const detail = [
      rate ? `${fmt(rate.rate)}/min` : null,
      Math.round(node.clock) !== 100 ? `${Math.round(node.clock)}%` : null,
      `${fmt(production?.power ?? 0)} MW`,
    ]
      .filter(Boolean)
      .join(' · ');
    out.push(text(colX + 44, y + 15, detail, { size: 9, fill: COL.muted }));
    if (index < rows.length - 1) {
      out.push(line(colX + 12, y + 24, colX + BOM_W - 12, y + 24, COL.lineSoft, 0.6));
    }
  });

  if (ordered.length > maxRows) {
    out.push(
      text(colX + 12, scheduleTop + 50 + rows.length * 42 + 6, `+${ordered.length - maxRows} ${L.more}`, {
        size: 9,
        fill: COL.dim,
      }),
    );
  }

  const bomTop = scheduleTop + scheduleHeight + 16;
  const bomRows = analysis.bom.slice(0, 7);
  const bomHeight = 40 + Math.max(bomRows.length, 1) * 24 + 8;

  out.push(
    `<rect x="${colX}" y="${bomTop}" width="${BOM_W}" height="${bomHeight}" rx="4" fill="${COL.panel}" fill-opacity="0.55" stroke="${COL.line}" stroke-width="1" />`,
  );
  out.push(text(colX + 12, bomTop + 20, L.bom, { size: 10, fill: COL.amber, spacing: 2 }));
  out.push(line(colX + 12, bomTop + 31, colX + BOM_W - 12, bomTop + 31, COL.lineSoft, 1));

  if (bomRows.length === 0) {
    out.push(text(colX + 12, bomTop + 52, '—', { size: 11, fill: COL.dim }));
  } else {
    bomRows.forEach((flow, index) => {
      const item = data.items.find((i) => i.id === flow.itemId);
      const y = bomTop + 48 + index * 24;
      out.push(
        text(colX + 12, y, clipText(localized(item?.name ?? { en: flow.itemId }, lang), 26), {
          size: 10.5,
          fill: COL.text,
          family: SANS,
        }),
      );
      out.push(text(colX + BOM_W - 12, y, `${fmt(flow.rate)}/min`, { size: 10.5, fill: COL.amber, anchor: 'end' }));
    });
  }

  const totalsTop = bomTop + bomHeight + 16;
  const totalsHeight = 108;
  out.push(
    `<rect x="${colX}" y="${totalsTop}" width="${BOM_W}" height="${totalsHeight}" rx="4" fill="${COL.panel}" fill-opacity="0.55" stroke="${COL.line}" stroke-width="1" />`,
  );
  const totals: Array<[string, string, string]> = [
    [L.nodes, String(nodeCount), COL.text],
    [L.machines, String(machineCount), COL.text],
    [L.power, `${fmt(analysis.powerConsumption)} MW`, COL.text],
    [L.generation, `${fmt(analysis.powerGeneration)} MW`, balance >= 0 ? COL.ok : COL.warn],
    [L.alerts, analysis.warnings.length > 0 ? String(analysis.warnings.length) : L.noAlerts, analysis.warnings.length > 0 ? COL.danger : COL.ok],
  ];
  totals.forEach(([label, value, color], index) => {
    const y = totalsTop + 22 + index * 20;
    out.push(text(colX + 12, y, label, { size: 9, fill: COL.dim, spacing: 1 }));
    out.push(text(colX + BOM_W - 12, y, value, { size: 10.5, fill: color, anchor: 'end', weight: 600 }));
  });

  if (totalOutputs > 0) {
    out.push(
      text(
        colX + BOM_W / 2,
        SHEET_H - M - 12,
        `${L.total} ${fmt(totalOutputs)}/min`,
        { size: 9, fill: COL.dim, anchor: 'middle' },
      ),
    );
  }

  // ---------- Cajetín ----------
  const tTop = SHEET_H - M - TITLE_H;
  const tLeft = M;
  const tRight = SHEET_W - M;
  const tWidth = tRight - tLeft;

  out.push(
    `<rect x="${tLeft}" y="${tTop}" width="${tWidth}" height="${TITLE_H}" fill="${COL.panel}" fill-opacity="0.72" stroke="${COL.accent}" stroke-width="1.4" />`,
  );
  out.push(line(tLeft, tTop + 74, tRight, tTop + 74, COL.line, 1));

  const brandX = tLeft + 20;
  out.push(text(brandX, tTop + 30, 'SataPlanner', { size: 19, weight: 700, fill: COL.text, family: SANS, spacing: 0.6 }));
  out.push(text(brandX, tTop + 54, doc.meta.name || '—', { size: 13, fill: COL.accent, family: SANS }));
  out.push(
    text(tLeft + tWidth - 20, tTop + 30, `${L.sheet} · SATA-BP-001`, {
      size: 9.5,
      fill: COL.dim,
      anchor: 'end',
      spacing: 1.6,
    }),
  );
  out.push(
    text(tLeft + tWidth - 20, tTop + 52, `${doc.nodes.length} ${L.nodes.toLowerCase()}`, {
      size: 9.5,
      fill: COL.dim,
      anchor: 'end',
    }),
  );

  const cells: Array<{ x: number; w: number; label: string; value: string; accent?: string }> = [
    { x: tLeft, w: tWidth * 0.14, label: L.game, value: doc.gameVersion || data.gameVersion },
    { x: tLeft + tWidth * 0.14, w: tWidth * 0.1, label: L.view, value: view === 'plan' ? L.plan : L.iso },
    { x: tLeft + tWidth * 0.24, w: tWidth * 0.12, label: L.scale, value: L.foundation },
    { x: tLeft + tWidth * 0.36, w: tWidth * 0.11, label: L.machines, value: String(machineCount) },
    {
      x: tLeft + tWidth * 0.47,
      w: tWidth * 0.15,
      label: L.power,
      value: `${fmt(analysis.powerConsumption)} / ${fmt(analysis.powerGeneration)} MW`,
      accent: balance >= 0 ? COL.ok : COL.warn,
    },
    { x: tLeft + tWidth * 0.62, w: tWidth * 0.12, label: L.alerts, value: analysis.warnings.length ? String(analysis.warnings.length) : L.noAlerts, accent: analysis.warnings.length ? COL.danger : COL.ok },
    { x: tLeft + tWidth * 0.74, w: tWidth * 0.13, label: L.date, value: dateText },
    { x: tLeft + tWidth * 0.87, w: tWidth * 0.13, label: 'REV', value: '0.1' },
  ];

  const rowTop = tTop + 74;
  for (const cell of cells) {
    out.push(line(cell.x, rowTop, cell.x, tTop + TITLE_H, COL.lineSoft, 0.8));
    out.push(text(cell.x + 10, rowTop + 20, cell.label, { size: 8, fill: COL.dim, spacing: 1.4 }));
    out.push(
      text(cell.x + 10, rowTop + 46, clipText(cell.value, 26), {
        size: 11.5,
        fill: cell.accent ?? COL.text,
        family: SANS,
        weight: 600,
      }),
    );
  }

  out.push(line(tLeft, rowTop + 66, tRight, rowTop + 66, COL.lineSoft, 0.8));
  out.push(
    text(tLeft + 12, tTop + TITLE_H - 20, L.disclaimer, { size: 8.5, fill: COL.dim, family: SANS }),
  );
  out.push(
    text(tRight - 12, tTop + TITLE_H - 20, `sataplanner · ${dateText}`, {
      size: 8.5,
      fill: COL.dim,
      anchor: 'end',
    }),
  );

  out.push('</svg>');
  return out.join('\n');
}
