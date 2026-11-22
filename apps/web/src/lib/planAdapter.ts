import type { ProductionPlan } from '@sataplanner/engine';
import { sampleGameData } from '@sataplanner/game-data';
import type { Doc, PlacedNode, Wire } from '../types';

const GAP = 0.5;

/**
 * Convierte el resultado del solver en un Doc editable: reparte los bloques
 * en estanterías dentro del marco y centra el conjunto en el origen.
 */
export function planToDoc(
  plan: ProductionPlan,
  options: { frame: number; floor: number; name: string; idPrefix?: string },
): Doc {
  const prefix = options.idPrefix ?? 'gen';
  const buildings = sampleGameData.buildings;
  const boxes = plan.steps.map((step, index) => {
    const building = buildings.find((b) => b.id === step.buildingId);
    const fp = building?.footprint ?? { w: 1, d: 1, h: 1 };
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, step.machines))));
    const rows = Math.max(1, Math.ceil(Math.max(1, step.machines) / columns));
    return { step, index, w: fp.w * columns, d: fp.d * rows };
  });

  const half = options.frame / 2;
  let cursorX = -half;
  let cursorY = -half;
  let rowHeight = 0;
  const positions = new Map<string, { x: number; y: number }>();

  for (const box of boxes) {
    if (cursorX > -half && cursorX + box.w > half) {
      cursorX = -half;
      cursorY += rowHeight + GAP;
      rowHeight = 0;
    }
    positions.set(box.step.id, { x: cursorX + box.w / 2, y: cursorY + box.d / 2 });
    cursorX += box.w + GAP;
    rowHeight = Math.max(rowHeight, box.d);
  }

  const xs = boxes.map((box) => {
    const p = positions.get(box.step.id)!;
    return [p.x - box.w / 2, p.x + box.w / 2];
  });
  const ys = boxes.map((box) => {
    const p = positions.get(box.step.id)!;
    return [p.y - box.d / 2, p.y + box.d / 2];
  });
  const minX = Math.min(...xs.map((pair) => pair[0]), 0);
  const maxX = Math.max(...xs.map((pair) => pair[1]), 0);
  const minY = Math.min(...ys.map((pair) => pair[0]), 0);
  const maxY = Math.max(...ys.map((pair) => pair[1]), 0);
  const shiftX = (minX + maxX) / 2;
  const shiftY = (minY + maxY) / 2;

  const nodes: PlacedNode[] = boxes.map(({ step, index }) => {
    const p = positions.get(step.id)!;
    return {
      id: `${prefix}_s${index + 1}`,
      buildingId: step.buildingId,
      recipeId: step.recipeId,
      x: Math.round((p.x - shiftX) * 4) / 4,
      y: Math.round((p.y - shiftY) * 4) / 4,
      floor: options.floor,
      rotation: 0,
      count: Math.max(1, Math.round(step.machines)),
      clock: Math.max(1, Math.round(step.clock)),
      somersloops: 0,
      label: step.producedItemId,
    };
  });

  const nodeIdByStep = new Map(plan.steps.map((step, index) => [step.id, nodes[index]!.id]));
  const wires: Wire[] = plan.links.flatMap((link, index) => {
    const from = nodeIdByStep.get(link.from);
    const to = nodeIdByStep.get(link.to);
    if (!from || !to) return [];
    return [
      {
        id: `${prefix}_w${index + 1}`,
        fromNodeId: from,
        toNodeId: to,
        itemId: link.itemId,
        transportId: link.transportId,
      },
    ];
  });

  return {
    schemaVersion: 1,
    gameVersion: sampleGameData.gameVersion,
    nodes,
    wires,
    meta: { name: options.name, updatedAt: new Date().toISOString() },
  };
}

/** Etiqueta corta para los listados del planning (building ×N). */
export function stepLabel(buildingId: string, machines: number): string {
  const building = sampleGameData.buildings.find((b) => b.id === buildingId);
  return `${building?.id ?? buildingId} ×${Math.round(machines)}`;
}
