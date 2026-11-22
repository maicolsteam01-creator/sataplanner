import { planProduction } from '@sataplanner/engine';
import { sampleGameData } from '@sataplanner/game-data';
import type { Doc } from '../types';
import { planToDoc } from './planAdapter';

export interface TemplateDef {
  id: string;
  itemId: string;
  rate: number;
}

/** Plantillas de arranque generadas con el mismo motor que el solver. */
export const TEMPLATES: TemplateDef[] = [
  { id: 'iron', itemId: 'reinforced-iron-plate', rate: 10 },
  { id: 'wire', itemId: 'cable', rate: 30 },
  { id: 'plastic', itemId: 'plastic', rate: 30 },
  { id: 'concrete', itemId: 'concrete', rate: 30 },
];

export function templateDoc(template: TemplateDef, frame: number, floor: number, name: string): Doc {
  const plan = planProduction(template.itemId, template.rate, sampleGameData);
  return planToDoc(plan, { frame, floor, name, idPrefix: `tpl_${template.id}` });
}
