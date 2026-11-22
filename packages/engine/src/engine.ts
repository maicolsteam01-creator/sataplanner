import type {
  Building,
  GameData,
  Recipe,
  Transport,
} from '@sataplanner/game-data';

/** Un nodo del plano: un bloque de N maquinas con una receta. */
export interface NodeConfig {
  id: string;
  buildingId: string;
  recipeId?: string;
  count: number;
  /** 1..250 */
  clock: number;
  somersloops: number;
}

/** Una conexion logistica entre dos nodos. */
export interface WireConfig {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  itemId?: string;
  transportId?: string;
}

export interface DocConfig {
  nodes: NodeConfig[];
  wires: WireConfig[];
}

export interface Flow {
  itemId: string;
  rate: number;
}

export interface NodeProduction {
  nodeId: string;
  buildingId: string;
  recipeId?: string;
  count: number;
  clock: number;
  somersloops: number;
  inputs: Flow[];
  outputs: Flow[];
  /** MW consumidos. */
  power: number;
  /** MW generados (solo generadores). */
  generation: number;
  machines: number;
}

export type FlowStatus = 'ok' | 'bottleneck' | 'starved';

export interface WireFlow {
  wireId: string;
  fromNodeId: string;
  toNodeId: string;
  itemId?: string;
  transportId?: string;
  /** Capacidad de la cinta/tuberia en unidades por minuto. */
  capacity: number;
  /** Flujo efectivo transportado. */
  rate: number;
  /** Flujo que la fuente queria enviar. */
  offered: number;
  utilization: number;
  status: FlowStatus;
}

export type WarningCode =
  | 'missing-building'
  | 'missing-recipe'
  | 'recipe-not-allowed'
  | 'no-item'
  | 'bottleneck'
  | 'starved'
  | 'no-transport';

export interface Warning {
  code: WarningCode;
  message: string;
  nodeId?: string;
  wireId?: string;
}

export interface Analysis {
  nodes: Record<string, NodeProduction>;
  wires: Record<string, WireFlow>;
  powerConsumption: number;
  powerGeneration: number;
  /** Insumos que hay que traer de afuera, por minuto. */
  bom: Flow[];
  warnings: Warning[];
}

const EPS = 1e-6;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const somersloopMultiplier = (
  data: GameData,
  building: Building,
  somersloops: number,
): number =>
  1 + data.balance.somersloopBonus * clamp(somersloops, 0, building.somersloopSlots);

export const powerFor = (
  data: GameData,
  building: Building,
  clock: number,
  count: number,
  multiplier: number,
): number => {
  const c = clamp(clock, data.balance.minClock, data.balance.maxClock) / 100;
  return building.powerBase * Math.pow(c, data.balance.powerExponent) * count * multiplier;
};

export interface Rates {
  inputs: Flow[];
  outputs: Flow[];
}

/** Tasas por maquina, ya con clock y somersloops aplicados. */
export function perMachineRates(
  recipe: Recipe,
  clock: number,
  multiplier = 1,
  limits = { min: 1, max: 250 },
): Rates {
  const factor = (clamp(clock, limits.min, limits.max) / 100) * multiplier;
  const scale = (qty: number) => (qty / recipe.time) * 60 * factor;
  return {
    inputs: recipe.inputs.map((i) => ({ itemId: i.itemId, rate: scale(i.qty) })),
    outputs: recipe.outputs.map((o) => ({ itemId: o.itemId, rate: scale(o.qty) })),
  };
}

/** Maquinas necesarias para alcanzar una tasa objetivo de un item. */
export function machinesFor(
  recipe: Recipe,
  itemId: string,
  targetPerMinute: number,
  clock = 100,
  multiplier = 1,
): number {
  const rates = perMachineRates(recipe, clock, multiplier);
  const perMachine = rates.outputs.find((o) => o.itemId === itemId)?.rate ?? 0;
  if (perMachine <= 0) return 0;
  return Math.ceil(targetPerMinute / perMachine - EPS);
}

/** Clock exacto para producir una tasa con una cantidad fija de maquinas. */
export function clockFor(
  recipe: Recipe,
  itemId: string,
  targetPerMinute: number,
  machines: number,
  multiplier = 1,
  maxClock = 250,
): number {
  const base = perMachineRates(recipe, 100, multiplier).outputs.find(
    (o) => o.itemId === itemId,
  )?.rate;
  if (!base || machines <= 0) return 0;
  return clamp((targetPerMinute / (base * machines)) * 100, 1, maxClock);
}

/** Analiza el plano completo: produccion, flujos, energia, BOM y alertas. */
export function analyze(doc: DocConfig, data: GameData): Analysis {
  const buildings = new Map(data.buildings.map((b) => [b.id, b]));
  const recipes = new Map(data.recipes.map((r) => [r.id, r]));
  const transports = new Map(data.transports.map((t) => [t.id, t]));

  const nodes: Record<string, NodeProduction> = {};
  const warnings: Warning[] = [];
  const production = new Map<string, number>();
  const demand = new Map<string, number>();

  for (const node of doc.nodes) {
    const building = buildings.get(node.buildingId);
    if (!building) {
      warnings.push({
        code: 'missing-building',
        message: `Unknown building "${node.buildingId}"`,
        nodeId: node.id,
      });
      continue;
    }

    const count = Math.max(1, node.count);
    const multiplier = somersloopMultiplier(data, building, node.somersloops);
    const recipe = node.recipeId ? recipes.get(node.recipeId) : undefined;

    let rates: Rates = { inputs: [], outputs: [] };
    if (recipe) {
      if (!recipe.buildingIds.includes(building.id)) {
        warnings.push({
          code: 'recipe-not-allowed',
          message: `Recipe "${recipe.id}" cannot run in "${building.id}"`,
          nodeId: node.id,
        });
      }
      rates = perMachineRates(recipe, node.clock, multiplier, {
        min: data.balance.minClock,
        max: data.balance.maxClock,
      });
    } else if (building.category !== 'logistics' && building.category !== 'power') {
      warnings.push({
        code: 'missing-recipe',
        message: `Node "${node.id}" has no recipe`,
        nodeId: node.id,
      });
    }

    const inputs = rates.inputs.map((f) => ({ ...f, rate: f.rate * count }));
    const outputs = rates.outputs.map((f) => ({ ...f, rate: f.rate * count }));
    const generation = (building.powerGeneration ?? 0) * count * (node.clock / 100);

    nodes[node.id] = {
      nodeId: node.id,
      buildingId: building.id,
      recipeId: node.recipeId,
      count,
      clock: node.clock,
      somersloops: node.somersloops,
      inputs,
      outputs,
      power: building.powerGeneration ? 0 : powerFor(data, building, node.clock, count, multiplier),
      generation,
      machines: count,
    };

    for (const input of inputs) {
      demand.set(input.itemId, (demand.get(input.itemId) ?? 0) + input.rate);
    }
    for (const output of outputs) {
      production.set(output.itemId, (production.get(output.itemId) ?? 0) + output.rate);
    }
  }

  const outgoing = new Map<string, number>();
  for (const wire of doc.wires) {
    const source = nodes[wire.fromNodeId];
    if (!source) continue;
    const itemId = resolveWireItem(wire, source, nodes[wire.toNodeId]);
    if (!itemId) continue;
    const key = `${wire.fromNodeId}|${itemId}`;
    outgoing.set(key, (outgoing.get(key) ?? 0) + 1);
  }

  const wires: Record<string, WireFlow> = {};
  const inflow = new Map<string, number>();

  for (const wire of doc.wires) {
    const source = nodes[wire.fromNodeId];
    const target = nodes[wire.toNodeId];
    if (!source || !target) continue;

    const itemId = resolveWireItem(wire, source, target);
    if (!itemId) {
      warnings.push({
        code: 'no-item',
        message: `Wire "${wire.id}" has no shared item`,
        wireId: wire.id,
      });
      continue;
    }

    const transport = resolveTransport(wire, itemId, data, transports);
    if (!transport) {
      warnings.push({
        code: 'no-transport',
        message: `Wire "${wire.id}" has no transport`,
        wireId: wire.id,
      });
      continue;
    }

    const produced = source.outputs.find((o) => o.itemId === itemId)?.rate ?? 0;
    const edges = outgoing.get(`${wire.fromNodeId}|${itemId}`) ?? 1;
    const offered = produced / edges;
    const rate = Math.min(offered, transport.rate);
    const utilization = transport.rate > 0 ? rate / transport.rate : 0;
    const bottleneck = offered > transport.rate + EPS;

    if (bottleneck) {
      warnings.push({
        code: 'bottleneck',
        message: `"${transport.id}" carries ${offered.toFixed(1)}/min but its limit is ${transport.rate}/min`,
        wireId: wire.id,
      });
    }

    wires[wire.id] = {
      wireId: wire.id,
      fromNodeId: wire.fromNodeId,
      toNodeId: wire.toNodeId,
      itemId,
      transportId: transport.id,
      capacity: transport.rate,
      rate,
      offered,
      utilization,
      status: bottleneck ? 'bottleneck' : 'ok',
    };

    const key = `${wire.toNodeId}|${itemId}`;
    inflow.set(key, (inflow.get(key) ?? 0) + rate);
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const input of node.inputs) {
      // Un insumo que nadie produce en el plano es una entrada externa
      // (mineral, agua): no es "hambre", es la frontera del blueprint.
      if (!production.has(input.itemId)) continue;
      const received = inflow.get(`${nodeId}|${input.itemId}`) ?? 0;
      if (received + EPS < input.rate) {
        warnings.push({
          code: 'starved',
          message: `Node "${nodeId}" needs ${input.rate.toFixed(1)}/min of "${input.itemId}" and receives ${received.toFixed(1)}/min`,
          nodeId,
        });
        for (const wire of Object.values(wires)) {
          if (wire.toNodeId === nodeId && wire.itemId === input.itemId) {
            wire.status = wire.status === 'bottleneck' ? 'bottleneck' : 'starved';
          }
        }
      }
    }
  }

  const bom: Flow[] = [];
  for (const [itemId, needed] of demand) {
    const made = production.get(itemId) ?? 0;
    const missing = needed - made;
    if (missing > EPS) bom.push({ itemId, rate: missing });
  }
  bom.sort((a, b) => b.rate - a.rate);

  const powerConsumption = Object.values(nodes).reduce((sum, n) => sum + n.power, 0);
  const powerGeneration = Object.values(nodes).reduce((sum, n) => sum + n.generation, 0);

  return {
    nodes,
    wires,
    powerConsumption,
    powerGeneration,
    bom,
    warnings,
  };
}

function resolveWireItem(
  wire: WireConfig,
  source: NodeProduction,
  target: NodeProduction | undefined,
): string | undefined {
  if (wire.itemId) return wire.itemId;
  const shared = source.outputs.find((o) =>
    target?.inputs.some((i) => i.itemId === o.itemId),
  );
  return shared?.itemId ?? source.outputs[0]?.itemId;
}

function resolveTransport(
  wire: WireConfig,
  itemId: string,
  data: GameData,
  transports: Map<string, Transport>,
): Transport | undefined {
  if (wire.transportId) {
    return transports.get(wire.transportId);
  }
  const item = data.items.find((i) => i.id === itemId);
  const kind = item?.form === 'liquid' || item?.form === 'gas' ? 'pipe' : 'belt';
  return data.transports.find((t) => t.kind === kind);
}
