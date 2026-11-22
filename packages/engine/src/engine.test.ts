import { describe, expect, it } from 'vitest';
import { recipeById, sampleGameData } from '@sataplanner/game-data';
import {
  analyze,
  clockFor,
  machinesFor,
  perMachineRates,
  powerFor,
} from './engine';

const data = sampleGameData;
const recipe = (id: string) => {
  const found = recipeById.get(id);
  if (!found) throw new Error(`missing recipe ${id}`);
  return found;
};

describe('perMachineRates', () => {
  it('convierte un ciclo de 2s en 30 unidades por minuto', () => {
    const rates = perMachineRates(recipe('iron-ingot'), 100);
    expect(rates.outputs[0]?.rate).toBeCloseTo(30);
    expect(rates.inputs[0]?.rate).toBeCloseTo(30);
  });

  it('escala con el clock', () => {
    const rates = perMachineRates(recipe('iron-ingot'), 50);
    expect(rates.outputs[0]?.rate).toBeCloseTo(15);
  });
});

describe('machinesFor / clockFor', () => {
  it('calcula 2 constructores para 40 placas/min', () => {
    expect(machinesFor(recipe('iron-plate'), 'iron-plate', 40)).toBe(2);
  });

  it('redondea hacia arriba cuando hace falta una fraccion', () => {
    expect(machinesFor(recipe('iron-plate'), 'iron-plate', 41)).toBe(3);
  });

  it('calcula el clock exacto para 2 maquinas y 30/min', () => {
    expect(clockFor(recipe('iron-plate'), 'iron-plate', 30, 2)).toBeCloseTo(75);
  });
});

describe('powerFor', () => {
  it('sigue la curva de overclock', () => {
    const smelter = data.buildings.find((b) => b.id === 'smelter')!;
    expect(powerFor(data, smelter, 100, 1, 1)).toBeCloseTo(4);
    // 4 * 2^1.321928 = 10
    expect(powerFor(data, smelter, 200, 1, 1)).toBeCloseTo(10, 1);
  });
});

describe('analyze', () => {
  it('resuelve una cadena fundidora -> constructor', () => {
    const result = analyze(
      {
        nodes: [
          { id: 'a', buildingId: 'smelter', recipeId: 'iron-ingot', count: 1, clock: 100, somersloops: 0 },
          { id: 'b', buildingId: 'constructor', recipeId: 'iron-plate', count: 1, clock: 100, somersloops: 0 },
        ],
        wires: [{ id: 'w1', fromNodeId: 'a', toNodeId: 'b' }],
      },
      data,
    );

    expect(result.wires.w1?.rate).toBeCloseTo(30);
    expect(result.wires.w1?.status).toBe('ok');
    expect(result.powerConsumption).toBeCloseTo(8);
    expect(result.bom).toEqual([{ itemId: 'iron-ore', rate: 30 }]);
    expect(result.warnings).toHaveLength(0);
  });

  it('detecta cuello de botella cuando la cinta no alcanza', () => {
    const result = analyze(
      {
        nodes: [
          { id: 'a', buildingId: 'smelter', recipeId: 'iron-ingot', count: 3, clock: 100, somersloops: 0 },
          { id: 'b', buildingId: 'constructor', recipeId: 'iron-plate', count: 1, clock: 100, somersloops: 0 },
        ],
        wires: [{ id: 'w1', fromNodeId: 'a', toNodeId: 'b', transportId: 'belt-mk1' }],
      },
      data,
    );

    expect(result.wires.w1?.status).toBe('bottleneck');
    expect(result.wires.w1?.rate).toBe(60);
    expect(result.warnings.some((w) => w.code === 'bottleneck')).toBe(true);
  });

  it('detecta un nodo con hambre de insumos', () => {
    const result = analyze(
      {
        nodes: [
          { id: 'a', buildingId: 'smelter', recipeId: 'iron-ingot', count: 1, clock: 100, somersloops: 0 },
          { id: 'b', buildingId: 'constructor', recipeId: 'iron-plate', count: 2, clock: 100, somersloops: 0 },
        ],
        wires: [{ id: 'w1', fromNodeId: 'a', toNodeId: 'b' }],
      },
      data,
    );

    expect(result.wires.w1?.status).toBe('starved');
    expect(result.warnings.some((w) => w.code === 'starved')).toBe(true);
  });

  it('aplica somersloops a produccion y energia', () => {
    const result = analyze(
      {
        nodes: [
          { id: 'a', buildingId: 'constructor', recipeId: 'iron-plate', count: 1, clock: 100, somersloops: 1 },
        ],
        wires: [],
      },
      data,
    );

    expect(result.nodes.a?.outputs[0]?.rate).toBeCloseTo(30);
    expect(result.nodes.a?.power).toBeCloseTo(6);
  });

  it('separa generacion de consumo', () => {
    const result = analyze(
      {
        nodes: [
          { id: 'g', buildingId: 'coal-generator', count: 2, clock: 100, somersloops: 0 },
          { id: 'c', buildingId: 'constructor', recipeId: 'iron-plate', count: 1, clock: 100, somersloops: 0 },
        ],
        wires: [],
      },
      data,
    );

    expect(result.powerGeneration).toBeCloseTo(150);
    expect(result.powerConsumption).toBeCloseTo(4);
  });
});
