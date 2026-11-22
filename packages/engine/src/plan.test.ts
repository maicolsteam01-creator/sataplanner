import { describe, expect, it } from 'vitest';
import { sampleGameData } from '@sataplanner/game-data';
import type { NodeConfig } from './engine';
import { phasePlan, planProduction, validateDesign } from './plan';
import type { DesignDoc } from './plan';

const data = sampleGameData;

type PlacedNode = NodeConfig & { x: number; y: number; floor: number };

const node = (
  id: string,
  buildingId: string,
  x: number,
  y: number,
  overrides: Partial<NodeConfig> = {},
  floor = 0,
): PlacedNode => ({
  id,
  buildingId,
  count: 1,
  clock: 100,
  somersloops: 0,
  x,
  y,
  floor,
  ...overrides,
});

describe('planProduction', () => {
  it('planifica lingotes de hierro desde mineral de hierro', () => {
    const plan = planProduction('iron-ingot', 60, data);

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      buildingId: 'smelter',
      recipeId: 'iron-ingot',
      producedItemId: 'iron-ingot',
      rate: 60,
      machines: 2,
      clock: 100,
      depth: 0,
      phase: 1,
    });
    expect(plan.rawInputs).toEqual([{ itemId: 'iron-ore', rate: 60 }]);
    expect(plan.machines).toBe(2);
    expect(plan.power).toBeCloseTo(8);
    expect(plan.unresolved).toEqual([]);
  });

  it('usa una sola fundidora al overclock en el modo clock', () => {
    const plan = planProduction('iron-ingot', 60, data, { mode: 'clock' });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.machines).toBe(1);
    expect(plan.steps[0]?.clock).toBeCloseTo(200);
    expect(plan.rawInputs).toEqual([{ itemId: 'iron-ore', rate: 60 }]);
  });

  it('expande la cadena de placas reforzadas con links coherentes', () => {
    const plan = planProduction('reinforced-iron-plate', 10, data);

    expect(plan.steps.map((step) => step.producedItemId)).toEqual([
      'reinforced-iron-plate',
      'iron-plate',
      'screw',
      'iron-ingot',
      'iron-rod',
    ]);
    expect(plan.steps.map((step) => step.buildingId)).toEqual([
      'assembler',
      'constructor',
      'constructor',
      'smelter',
      'constructor',
    ]);
    expect(plan.rawInputs).toEqual([{ itemId: 'iron-ore', rate: 120 }]);
    expect(plan.links).toHaveLength(5);
    for (const link of plan.links) {
      const from = plan.steps.find((step) => step.id === link.from);
      const to = plan.steps.find((step) => step.id === link.to);
      expect(from?.producedItemId).toBe(link.itemId);
      expect(to?.inputs.some((flow) => flow.itemId === link.itemId && Math.abs(flow.rate - link.rate) < 1e-6)).toBe(true);
      expect(link.transportId).toMatch(/^belt-mk/);
    }
    expect(plan.links.filter((link) => link.itemId === 'iron-ingot').map((link) => link.rate)).toEqual([60, 60]);
    expect(plan.steps.map((step) => step.depth)).toEqual([3, 1, 2, 0, 1]);
    expect(plan.steps.map((step) => step.phase)).toEqual([4, 2, 3, 1, 2]);
    expect(plan.unresolved).toEqual([]);
  });

  it('prefiere recetas alternativas cuando se pide', () => {
    const normal = planProduction('reinforced-iron-plate', 10, data);
    const alternate = planProduction('reinforced-iron-plate', 10, data, { preferAlternate: true });
    const alternateWire = planProduction('wire', 10, data, { preferAlternate: true });

    expect(normal.steps[0]?.recipeId).toBe('reinforced-iron-plate');
    expect(alternate.steps[0]?.recipeId).toBe('alt-stitched-iron-plate');
    expect(alternateWire.steps[0]?.recipeId).toBe('alt-iron-wire');
  });

  it('respeta maxClock y avisa cuando una tasa es imposible', () => {
    const plan = planProduction('iron-ingot', 100000, data, { mode: 'clock', maxClock: 150 });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.machines).toBe(1);
    expect(plan.steps[0]?.clock).toBeLessThanOrEqual(150);
    expect(plan.unresolved.some((message) => message.includes('above the maximum'))).toBe(true);
  });

  it('rechaza un clock pedido por encima del maximo', () => {
    const plan = planProduction('iron-ingot', 60, data, { clock: 300 });

    expect(plan.steps).toEqual([]);
    expect(plan.unresolved.join(' ')).toContain('300%');
  });

  it('limita el numero de maquinas por paso', () => {
    const plan = planProduction('iron-ingot', 600, data, { machineLimit: 5 });

    expect(plan.steps[0]?.machines).toBe(5);
    expect(plan.unresolved.some((message) => message.includes('20 machines'))).toBe(true);
  });

  it('devuelve unresolved para un item inexistente', () => {
    const plan = planProduction('no-such-item', 60, data);

    expect(plan.steps).toEqual([]);
    expect(plan.links).toEqual([]);
    expect(plan.unresolved.join(' ')).toContain('no-such-item');
  });
});

describe('phasePlan', () => {
  it('ordena las fases y acumula maquinas y energia', () => {
    const plan = planProduction('reinforced-iron-plate', 10, data);
    const phases = phasePlan(plan);

    expect(phases.map((phase) => phase.phase)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]!.cumulativeMachines).toBeGreaterThanOrEqual(phases[i - 1]!.cumulativeMachines);
      expect(phases[i]!.cumulativePower).toBeGreaterThanOrEqual(phases[i - 1]!.cumulativePower);
    }
    expect(phases[phases.length - 1]?.cumulativeMachines).toBe(plan.machines);
    expect(phases[phases.length - 1]?.cumulativePower).toBeCloseTo(plan.power);
    expect(phases[0]?.buildings).toEqual([{ itemId: 'smelter', rate: 4 }]);
    expect(phases[1]?.buildings).toEqual([
      { itemId: 'constructor', rate: 6 },
      { itemId: 'smelter', rate: 4 },
    ]);
    expect(phasePlan({ ...plan, steps: [] })).toEqual([]);
  });
});

describe('validateDesign', () => {
  it('detecta solapes en el mismo piso', () => {
    const doc: DesignDoc = {
      frame: 4,
      nodes: [
        node('a', 'smelter', 0, 0, { recipeId: 'iron-ingot' }),
        node('b', 'constructor', 0, 0, { recipeId: 'iron-plate' }),
      ],
      wires: [{ id: 'w1', fromNodeId: 'a', toNodeId: 'b' }],
    };

    const issues = validateDesign(doc, data);
    expect(issues.some((issue) => issue.code === 'overlap' && issue.severity === 'error')).toBe(true);
  });

  it('detecta nodos fuera del marco', () => {
    const doc: DesignDoc = {
      frame: 4,
      nodes: [node('a', 'smelter', 10, 0, { recipeId: 'iron-ingot' })],
      wires: [],
    };

    const issues = validateDesign(doc, data);
    expect(issues.some((issue) => issue.code === 'outside-frame' && issue.nodeId === 'a')).toBe(true);
  });

  it('detecta sobrecarga de cinta', () => {
    const doc: DesignDoc = {
      frame: 4,
      nodes: [
        node('a', 'smelter', -1, -0.5, { recipeId: 'iron-ingot', count: 3 }),
        node('b', 'constructor', 1.5, 0, { recipeId: 'iron-plate' }),
      ],
      wires: [{ id: 'w1', fromNodeId: 'a', toNodeId: 'b', transportId: 'belt-mk1' }],
    };

    const issues = validateDesign(doc, data);
    const overload = issues.find((issue) => issue.code === 'belt-overload');
    expect(overload?.severity).toBe('warn');
    expect(overload?.wireId).toBe('w1');
    expect(overload?.message).toContain('90.00/min');
  });

  it('detecta deficit de potencia cuando la generacion no alcanza', () => {
    const smelters = Array.from({ length: 20 }, (_, i) =>
      node(`s${i}`, 'smelter', i * 3, 0, { recipeId: 'iron-ingot' }),
    );
    const doc: DesignDoc = {
      frame: 200,
      nodes: [node('g', 'coal-generator', -10, 0), ...smelters],
      wires: [],
    };

    const issues = validateDesign(doc, data);
    expect(issues.filter((issue) => issue.code === 'overlap')).toEqual([]);
    expect(issues.filter((issue) => issue.code === 'outside-frame')).toEqual([]);
    const deficit = issues.find((issue) => issue.code === 'power-deficit');
    expect(deficit?.severity).toBe('error');
    expect(deficit?.message).toContain('5.00 MW');
  });

  it('detecta demasiados sloops, clock invalido y ciclos', () => {
    const doc: DesignDoc = {
      frame: 20,
      nodes: [
        node('a', 'smelter', 0, 0, { recipeId: 'iron-ingot', somersloops: 2, clock: 300 }),
        node('b', 'constructor', 4, 0, { recipeId: 'iron-plate' }),
        node('c', 'constructor', 8, 0, { recipeId: 'iron-rod' }),
      ],
      wires: [
        { id: 'w1', fromNodeId: 'a', toNodeId: 'b' },
        { id: 'w2', fromNodeId: 'b', toNodeId: 'c' },
        { id: 'w3', fromNodeId: 'c', toNodeId: 'a' },
      ],
    };

    const issues = validateDesign(doc, data);
    expect(issues.some((issue) => issue.code === 'too-many-sloops' && issue.nodeId === 'a')).toBe(true);
    expect(issues.some((issue) => issue.code === 'bad-clock' && issue.nodeId === 'a')).toBe(true);
    expect(issues.some((issue) => issue.code === 'cycle' && issue.wireId === 'w3')).toBe(true);
  });

  it('no reporta falsos positivos en el documento de ejemplo', () => {
    const doc: DesignDoc = {
      frame: 4,
      nodes: [
        node('smelter', 'smelter', -1, -0.5, { recipeId: 'iron-ingot' }),
        node('constructor', 'constructor', 1.5, 0, { recipeId: 'iron-plate' }),
      ],
      wires: [{ id: 'w1', fromNodeId: 'smelter', toNodeId: 'constructor' }],
    };

    expect(validateDesign(doc, data)).toEqual([]);
  });

  it('avisa de entradas producidas en el documento sin cable', () => {
    const doc: DesignDoc = {
      frame: 4,
      nodes: [
        node('a', 'smelter', -1, -0.5, { recipeId: 'iron-ingot' }),
        node('b', 'constructor', 1.5, 0, { recipeId: 'iron-plate' }),
      ],
      wires: [],
    };

    const issues = validateDesign(doc, data);
    expect(issues.some((issue) => issue.code === 'unconnected-input' && issue.nodeId === 'b')).toBe(true);
  });
});
