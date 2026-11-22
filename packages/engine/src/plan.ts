import type { Building, GameData, Recipe } from '@sataplanner/game-data';
import { analyze, clockFor, machinesFor, perMachineRates, powerFor } from './engine';
import type { Flow, NodeConfig, WireConfig } from './engine';

const EPS = 1e-6;
const MAX_ITERATIONS = 200;

/** Opciones de Expansion de la demanda. */
export interface PlanOptions {
  /** Clock de las maquinas en el modo 'machines'. Default 100. */
  clock?: number;
  /** Tope de clock para el modo 'clock'. Default data.balance.maxClock. */
  maxClock?: number;
  /** Si se prefieren recetas alternativas. Default false. */
  preferAlternate?: boolean;
  /** Como se alcanza la tasa: mas maquinas o mas clock. Default 'machines'. */
  mode?: 'machines' | 'clock';
  /** Maximo de maquinas por paso. Default 50. */
  machineLimit?: number;
}

/** Un paso del plan: un bloque de maquinas con una receta. */
export interface PlanStep {
  /** Identificador determinista: 's1', 's2', ... */
  id: string;
  buildingId: string;
  recipeId: string;
  producedItemId: string;
  /** Tasa requerida del item producido, por minuto. */
  rate: number;
  machines: number;
  /** Clock efectivo de las maquinas. */
  clock: number;
  /** MW consumidos (multiplicador de sloops = 1). */
  power: number;
  inputs: Flow[];
  outputs: Flow[];
  /** 0 = el paso solo consume materias primas. */
  depth: number;
  /** depth + 1. */
  phase: number;
}

/** Una conexion logistica entre dos pasos del plan. */
export interface PlanLink {
  /** Identificador determinista: 'l1', 'l2', ... */
  id: string;
  from: string;
  to: string;
  itemId: string;
  rate: number;
  transportId: string;
}

/** Resultado de expandir una demanda hacia atras. */
export interface ProductionPlan {
  targetItemId: string;
  targetRate: number;
  steps: PlanStep[];
  links: PlanLink[];
  rawInputs: Flow[];
  power: number;
  machines: number;
  /** Motivos por los que la demanda no se pudo satisfacer por completo. */
  unresolved: string[];
}

/** Un grupo de pasos de una misma fase. */
export interface PlanPhase {
  phase: number;
  steps: PlanStep[];
  cumulativeMachines: number;
  cumulativePower: number;
  /** Edificios acumulados por buildingId (itemId = buildingId, rate = cantidad). */
  buildings: Flow[];
}

/** Tipos de problema que puede tener un blueprint. */
export type DesignIssueCode =
  | 'overlap'
  | 'outside-frame'
  | 'unconnected-input'
  | 'belt-overload'
  | 'power-deficit'
  | 'missing-recipe'
  | 'too-many-sloops'
  | 'bad-clock'
  | 'wire-no-item'
  | 'cycle';

/** Un aviso de diseno, pensado para que la UI pueda seleccionar el elemento. */
export interface DesignIssue {
  code: DesignIssueCode;
  severity: 'error' | 'warn' | 'info';
  nodeId?: string;
  wireId?: string;
  /** Mensaje en ingles, con numeros cuando aplica. */
  message: string;
  /** Sugerencia en ingles. */
  suggestion?: string;
}

/** Documento de diseno con posiciones de los nodos. */
export interface DesignDoc {
  nodes: Array<NodeConfig & { x: number; y: number; floor: number }>;
  wires: WireConfig[];
  /** Tamaño del marco cuadrado, centrado en el origen. Default 4. */
  frame?: number;
}

interface StepDraft {
  itemId: string;
  recipe: Recipe;
  building: Building;
  /** Unidades del item producido por ciclo de la receta. */
  outQty: number;
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const fmt = (value: number): string => value.toFixed(2);

/** Elige la receta productora del item: primero las normales salvo preferAlternate. */
function chooseRecipe(data: GameData, itemId: string, preferAlternate: boolean): Recipe | undefined {
  const candidates = data.recipes.filter((recipe) =>
    recipe.outputs.some((output) => output.itemId === itemId),
  );
  if (candidates.length === 0) return undefined;
  const preferred = candidates.filter((recipe) => recipe.alternate === preferAlternate);
  return preferred[0] ?? candidates[0];
}

/** Transporte mas barato que alcanza la tasa, o el mas rapido si ninguno alcanza. */
function chooseTransport(data: GameData, itemId: string, rate: number): string {
  const form = data.items.find((item) => item.id === itemId)?.form ?? 'solid';
  const kind = form === 'liquid' || form === 'gas' ? 'pipe' : 'belt';
  const candidates = data.transports
    .filter((transport) => transport.kind === kind)
    .sort((a, b) => a.rate - b.rate || a.tier - b.tier || a.id.localeCompare(b.id));
  if (candidates.length === 0) return '';
  return (candidates.find((transport) => transport.rate + EPS >= rate) ?? candidates[candidates.length - 1]).id;
}

/** Tasa por minuto de un item a un clock dado. */
function outRate(recipe: Recipe, itemId: string, clock: number): number {
  return perMachineRates(recipe, clock).outputs.find((flow) => flow.itemId === itemId)?.rate ?? 0;
}

/** Detecta aristas que cierran un ciclo en el grafo consumidor -> productor. */
function findBackEdges(drafts: StepDraft[], stepByItem: Map<string, number>): Set<number> {
  const state = new Array<number>(drafts.length).fill(0);
  const blocked = new Set<number>();
  const visit = (index: number): void => {
    state[index] = 1;
    for (const input of drafts[index].recipe.inputs) {
      const next = stepByItem.get(input.itemId);
      if (next === undefined) continue;
      if (state[next] === 1) blocked.add(index);
      else if (state[next] === 0) visit(next);
    }
    state[index] = 2;
  };
  for (let i = 0; i < drafts.length; i++) {
    if (state[i] === 0) visit(i);
  }
  return blocked;
}

/**
 * Expansion determinista de la demanda hacia atras, con un solo paso por item.
 * Los pasos se descubren antes de calcular tasas para poder acumular demandas
 * repetidas (por ejemplo, el hierro que comen la placa y el tornillo).
 */
export function planProduction(
  targetItemId: string,
  targetRate: number,
  data: GameData,
  options: PlanOptions = {},
): ProductionPlan {
  const clock = options.clock ?? 100;
  const maxClock = options.maxClock ?? data.balance.maxClock;
  const preferAlternate = options.preferAlternate ?? false;
  const mode = options.mode ?? 'machines';
  const machineLimit = Math.max(0, Math.floor(options.machineLimit ?? 50));
  const unresolved: string[] = [];

  const empty = (): ProductionPlan => ({
    targetItemId,
    targetRate,
    steps: [],
    links: [],
    rawInputs: [],
    power: 0,
    machines: 0,
    unresolved,
  });

  if (!data.items.some((item) => item.id === targetItemId)) {
    unresolved.push(`Unknown item "${targetItemId}"`);
    return empty();
  }
  if (!Number.isFinite(targetRate) || targetRate <= 0) {
    unresolved.push(`Target rate for "${targetItemId}" must be a positive number`);
    return empty();
  }
  if (!Number.isFinite(clock) || clock > maxClock + EPS) {
    unresolved.push(`Requested clock ${clock}% exceeds the maximum clock ${maxClock}%`);
    return empty();
  }

  // Fase 1: descubrir que items tienen receta productora.
  const drafts: StepDraft[] = [];
  const stepByItem = new Map<string, number>();
  const queued = new Set<string>([targetItemId]);
  const queue: string[] = [targetItemId];
  let iterations = 0;
  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const itemId = queue.shift() as string;
    const recipe = chooseRecipe(data, itemId, preferAlternate);
    if (!recipe) continue; // materia prima: no hay receta que lo produzca
    const building = data.buildings.find((candidate) => candidate.id === recipe.buildingIds[0]);
    if (!building) {
      unresolved.push(
        `Recipe "${recipe.id}" for "${itemId}" has no available building "${recipe.buildingIds[0] ?? ''}"`,
      );
      continue;
    }
    const outQty = recipe.outputs.find((output) => output.itemId === itemId)?.qty ?? recipe.outputs[0]?.qty ?? 1;
    stepByItem.set(itemId, drafts.length);
    drafts.push({ itemId, recipe, building, outQty });
    for (const input of recipe.inputs) {
      if (!queued.has(input.itemId)) {
        queued.add(input.itemId);
        queue.push(input.itemId);
      }
    }
  }
  if (queue.length > 0) {
    unresolved.push(`Production chain exceeded ${MAX_ITERATIONS} steps`);
  }

  // Fase 2: propagar la demanda desde el objetivo hasta las materias primas.
  const blocked = findBackEdges(drafts, stepByItem);
  if (blocked.size > 0) {
    unresolved.push(`Cycle detected in the production chain involving ${blocked.size} step(s)`);
  }
  const consumers = new Array<number>(drafts.length).fill(0);
  for (let i = 0; i < drafts.length; i++) {
    if (blocked.has(i)) continue;
    for (const input of drafts[i].recipe.inputs) {
      const producer = stepByItem.get(input.itemId);
      if (producer !== undefined) consumers[producer]++;
    }
  }
  const order: number[] = [];
  const ready = consumers.map((count, index) => (count === 0 ? index : -1)).filter((index) => index >= 0);
  while (ready.length > 0) {
    const index = ready.shift() as number;
    order.push(index);
    if (blocked.has(index)) continue;
    for (const input of drafts[index].recipe.inputs) {
      const producer = stepByItem.get(input.itemId);
      if (producer === undefined) continue;
      consumers[producer]--;
      if (consumers[producer] === 0) ready.push(producer);
    }
  }
  for (let i = 0; i < drafts.length; i++) {
    if (!order.includes(i)) order.push(i);
  }

  const demand = new Map<string, number>([[targetItemId, targetRate]]);
  const rates = new Array<number>(drafts.length).fill(0);
  for (const index of order) {
    const draft = drafts[index];
    const rate = Math.max(0, demand.get(draft.itemId) ?? 0);
    rates[index] = rate;
    for (const input of draft.recipe.inputs) {
      const needed = (rate * input.qty) / draft.outQty;
      demand.set(input.itemId, (demand.get(input.itemId) ?? 0) + needed);
    }
  }

  // Fase 3: maquinas, clock, flujos y energia de cada paso.
  const steps: PlanStep[] = drafts.map((draft, index) => {
    const rate = rates[index];
    let machines: number;
    let stepClock: number;
    if (mode === 'clock') {
      const base = outRate(draft.recipe, draft.itemId, 100);
      const required = base > 0 ? (rate / base) * 100 : 0;
      stepClock = clockFor(draft.recipe, draft.itemId, rate, 1, 1, maxClock);
      if (required > maxClock + EPS) {
        unresolved.push(
          `Item "${draft.itemId}" needs clock ${fmt(required)}% to reach ${fmt(rate)}/min with 1 machine, above the maximum ${maxClock}%`,
        );
        stepClock = maxClock;
      }
      machines = 1;
    } else {
      stepClock = clock;
      const needed = machinesFor(draft.recipe, draft.itemId, rate, clock);
      machines = Math.min(needed, machineLimit);
      if (needed > machines) {
        unresolved.push(
          `Item "${draft.itemId}" needs ${needed} machines but the limit is ${machineLimit}`,
        );
      }
      if (needed === 0 && rate > EPS) {
        unresolved.push(`Recipe "${draft.recipe.id}" cannot produce "${draft.itemId}"`);
      }
    }

    return {
      id: `s${index + 1}`,
      buildingId: draft.building.id,
      recipeId: draft.recipe.id,
      producedItemId: draft.itemId,
      rate,
      machines,
      clock: stepClock,
      power: powerFor(data, draft.building, stepClock, machines, 1),
      inputs: draft.recipe.inputs.map((input) => ({
        itemId: input.itemId,
        rate: (rate * input.qty) / draft.outQty,
      })),
      outputs: draft.recipe.outputs.map((output) => ({
        itemId: output.itemId,
        rate: (rate * output.qty) / draft.outQty,
      })),
      depth: 0,
      phase: 1,
    };
  });

  // Fase 4: profundidad desde las materias primas, con guarda contra ciclos.
  const depths = new Array<number>(steps.length).fill(-1);
  const visiting = new Set<number>();
  const depthOf = (index: number): number => {
    if (depths[index] >= 0) return depths[index];
    if (visiting.has(index)) return 0;
    visiting.add(index);
    let depth = 0;
    for (const input of steps[index].inputs) {
      const producer = stepByItem.get(input.itemId);
      if (producer === undefined) continue;
      depth = Math.max(depth, 1 + depthOf(producer));
    }
    visiting.delete(index);
    depths[index] = depth;
    return depth;
  };
  for (let index = 0; index < steps.length; index++) {
    const depth = depthOf(index);
    steps[index].depth = depth;
    steps[index].phase = depth + 1;
  }

  // Fase 5: conexiones productor -> consumidor con el transporte adecuado.
  const links: PlanLink[] = [];
  for (const step of steps) {
    for (const input of step.inputs) {
      if (input.rate <= EPS) continue;
      const producer = stepByItem.get(input.itemId);
      if (producer === undefined) continue;
      links.push({
        id: `l${links.length + 1}`,
        from: steps[producer].id,
        to: step.id,
        itemId: input.itemId,
        rate: input.rate,
        transportId: chooseTransport(data, input.itemId, input.rate),
      });
    }
  }

  const rawInputs: Flow[] = [];
  for (const [itemId, rate] of demand) {
    if (rate > EPS && !stepByItem.has(itemId)) rawInputs.push({ itemId, rate });
  }

  return {
    targetItemId,
    targetRate,
    steps,
    links,
    rawInputs,
    power: steps.reduce((sum, step) => sum + step.power, 0),
    machines: steps.reduce((sum, step) => sum + step.machines, 0),
    unresolved,
  };
}

/** Agrupa los pasos por fase y acumula maquinas, energia y edificios. */
export function phasePlan(plan: ProductionPlan): PlanPhase[] {
  const byPhase = new Map<number, PlanStep[]>();
  for (const step of plan.steps) {
    const group = byPhase.get(step.phase) ?? [];
    group.push(step);
    byPhase.set(step.phase, group);
  }

  let cumulativeMachines = 0;
  let cumulativePower = 0;
  const buildings = new Map<string, number>();
  return [...byPhase.keys()].sort((a, b) => a - b).map((phase) => {
    const steps = byPhase.get(phase) ?? [];
    for (const step of steps) {
      cumulativeMachines += step.machines;
      cumulativePower += step.power;
      buildings.set(step.buildingId, (buildings.get(step.buildingId) ?? 0) + step.machines);
    }
    return {
      phase,
      steps,
      cumulativeMachines,
      cumulativePower,
      buildings: [...buildings.entries()]
        .map(([itemId, rate]) => ({ itemId, rate }))
        .sort((a, b) => a.itemId.localeCompare(b.itemId)),
    };
  });
}

/** Valida un documento de diseno: geometria, logistica, energia y grafo. */
export function validateDesign(doc: DesignDoc, data: GameData): DesignIssue[] {
  const analysis = analyze(doc, data);
  const issues: DesignIssue[] = [];
  const buildings = new Map(data.buildings.map((building) => [building.id, building]));
  const floors = new Map(doc.nodes.map((node) => [node.id, node.floor]));
  const frame = doc.frame ?? 4;
  const half = frame / 2;

  const wiresToItem = new Map<string, Set<string>>();
  for (const wire of Object.values(analysis.wires)) {
    if (!wire.itemId) continue;
    const items = wiresToItem.get(wire.toNodeId) ?? new Set<string>();
    items.add(wire.itemId);
    wiresToItem.set(wire.toNodeId, items);
  }

  // Entradas producidas en el documento pero sin ningun cable que las lleve.
  const reportedUnconnected = new Set<string>();
  for (const node of doc.nodes) {
    const inputs = analysis.nodes[node.id]?.inputs ?? [];
    for (const input of inputs) {
      const producedHere = doc.nodes.some(
        (other) =>
          other.id !== node.id &&
          (analysis.nodes[other.id]?.outputs.some((output) => output.itemId === input.itemId) ?? false),
      );
      if (!producedHere) continue;
      if (wiresToItem.get(node.id)?.has(input.itemId)) continue;
      reportedUnconnected.add(`${node.id}|${input.itemId}`);
      issues.push({
        code: 'unconnected-input',
        severity: 'warn',
        nodeId: node.id,
        message: `Node "${node.id}" needs ${fmt(input.rate)}/min of "${input.itemId}" but no wire delivers it`,
        suggestion: `Connect "${node.id}" to a producer of "${input.itemId}"`,
      });
    }
  }

  // Reexportamos los avisos del analisis con codigos y textos de la UI.
  for (const warning of analysis.warnings) {
    if (warning.code === 'missing-recipe') {
      issues.push({
        code: 'missing-recipe',
        severity: 'warn',
        nodeId: warning.nodeId,
        message: `Node "${warning.nodeId ?? '?'}" has no recipe assigned`,
        suggestion: `Assign a recipe to node "${warning.nodeId ?? '?'}"`,
      });
    } else if (warning.code === 'no-item') {
      issues.push({
        code: 'wire-no-item',
        severity: 'warn',
        wireId: warning.wireId,
        message: `Wire "${warning.wireId ?? '?'}" has no item to transport`,
        suggestion: `Set itemId on wire "${warning.wireId ?? '?'}" or connect nodes with a shared item`,
      });
    } else if (warning.code === 'bottleneck') {
      const wire = warning.wireId ? analysis.wires[warning.wireId] : undefined;
      const offered = wire?.offered ?? 0;
      const capacity = wire?.capacity ?? 0;
      const transport = wire?.transportId ?? 'transport';
      issues.push({
        code: 'belt-overload',
        severity: 'warn',
        wireId: warning.wireId,
        message: `Wire "${warning.wireId ?? '?'}" offers ${fmt(offered)}/min but ${transport} is limited to ${capacity}/min`,
        suggestion: `Use a higher tier transport on wire "${warning.wireId ?? '?'}"`,
      });
    } else if (warning.code === 'starved' && warning.nodeId) {
      const node = analysis.nodes[warning.nodeId];
      const input = node?.inputs.find((flow) => warning.message.includes(`"${flow.itemId}"`));
      const itemId = input?.itemId ?? 'input';
      if (!reportedUnconnected.has(`${warning.nodeId}|${itemId}`)) {
        const received = Object.values(analysis.wires)
          .filter((wire) => wire.toNodeId === warning.nodeId && wire.itemId === itemId)
          .reduce((sum, wire) => sum + wire.rate, 0);
        issues.push({
          code: 'unconnected-input',
          severity: 'warn',
          nodeId: warning.nodeId,
          message: `Node "${warning.nodeId}" needs ${fmt(input?.rate ?? 0)}/min of "${itemId}" but receives ${fmt(received)}/min`,
          suggestion: `Add or upgrade a wire carrying "${itemId}" into "${warning.nodeId}"`,
        });
      }
    }
  }

  // Footprints centrados en (x, y), con tolerancia para bordes que se tocan.
  const rects = new Map<string, Rect>();
  for (const node of doc.nodes) {
    const building = buildings.get(node.buildingId);
    if (!building) {
      issues.push({
        code: 'missing-recipe',
        severity: 'warn',
        nodeId: node.id,
        message: `Node "${node.id}" uses unknown building "${node.buildingId}"`,
        suggestion: `Choose a building known to the game data for "${node.id}"`,
      });
      continue;
    }
    const w = building.footprint.w / 2;
    const d = building.footprint.d / 2;
    const rect = { minX: node.x - w, maxX: node.x + w, minY: node.y - d, maxY: node.y + d };
    rects.set(node.id, rect);
    if (
      rect.minX < -half - EPS ||
      rect.maxX > half + EPS ||
      rect.minY < -half - EPS ||
      rect.maxY > half + EPS
    ) {
      issues.push({
        code: 'outside-frame',
        severity: 'error',
        nodeId: node.id,
        message: `Node "${node.id}" extends outside the ${frame}-tile frame: x ${fmt(rect.minX)}..${fmt(rect.maxX)}, y ${fmt(rect.minY)}..${fmt(rect.maxY)}`,
        suggestion: `Move "${node.id}" inside x/y [-${half}, ${half}]`,
      });
    }
  }

  const rectIds = [...rects.keys()];
  for (let i = 0; i < rectIds.length; i++) {
    for (let j = i + 1; j < rectIds.length; j++) {
      if (floors.get(rectIds[i]) !== floors.get(rectIds[j])) continue;
      const a = rects.get(rectIds[i]) as Rect;
      const b = rects.get(rectIds[j]) as Rect;
      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      if (overlapX <= EPS || overlapY <= EPS) continue;
      issues.push({
        code: 'overlap',
        severity: 'error',
        nodeId: rectIds[j],
        message: `Nodes "${rectIds[i]}" and "${rectIds[j]}" overlap on floor ${floors.get(rectIds[j])} by ${fmt(overlapX)} x ${fmt(overlapY)} tiles`,
        suggestion: `Move "${rectIds[j]}" so the footprints stop intersecting`,
      });
    }
  }

  // Un blueprint sin generadores se supone conectado a la red: solo avisamos
  // si hay generacion propia y esta no cubre el consumo.
  const hasGenerator = doc.nodes.some(
    (node) => (buildings.get(node.buildingId)?.powerGeneration ?? 0) > 0,
  );
  const netPower = analysis.powerGeneration - analysis.powerConsumption;
  if (hasGenerator && netPower < -EPS) {
    issues.push({
      code: 'power-deficit',
      severity: 'error',
      message: `Power deficit of ${fmt(-netPower)} MW: ${fmt(analysis.powerConsumption)} MW needed but only ${fmt(analysis.powerGeneration)} MW generated`,
      suggestion: 'Add generators or lower the clock and machine count',
    });
  }

  for (const node of doc.nodes) {
    const building = buildings.get(node.buildingId);
    if (building && node.somersloops > building.somersloopSlots) {
      issues.push({
        code: 'too-many-sloops',
        severity: 'error',
        nodeId: node.id,
        message: `Node "${node.id}" has ${node.somersloops} somersloops but "${node.buildingId}" only has ${building.somersloopSlots} slot(s)`,
        suggestion: `Use at most ${building.somersloopSlots} somersloops in "${node.id}"`,
      });
    }
    if (
      !Number.isFinite(node.clock) ||
      node.clock < data.balance.minClock ||
      node.clock > data.balance.maxClock
    ) {
      issues.push({
        code: 'bad-clock',
        severity: 'error',
        nodeId: node.id,
        message: `Node "${node.id}" has clock ${node.clock}% outside [${data.balance.minClock}, ${data.balance.maxClock}]%`,
        suggestion: `Set the clock of "${node.id}" between ${data.balance.minClock}% and ${data.balance.maxClock}%`,
      });
    }
  }

  // Ciclos en el grafo de cables, con el cable que cierra el ciclo.
  const adjacency = new Map<string, Array<{ to: string; wireId: string }>>();
  const graphNodes: string[] = [];
  for (const node of doc.nodes) graphNodes.push(node.id);
  for (const wire of doc.wires) {
    const edges = adjacency.get(wire.fromNodeId) ?? [];
    edges.push({ to: wire.toNodeId, wireId: wire.id });
    adjacency.set(wire.fromNodeId, edges);
    if (!graphNodes.includes(wire.fromNodeId)) graphNodes.push(wire.fromNodeId);
    if (!graphNodes.includes(wire.toNodeId)) graphNodes.push(wire.toNodeId);
  }
  const state = new Map<string, number>();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 1);
    stack.push(id);
    for (const edge of adjacency.get(id) ?? []) {
      const edgeState = state.get(edge.to) ?? 0;
      if (edgeState === 1 && !reportedCycles.has(edge.wireId)) {
        reportedCycles.add(edge.wireId);
        const start = stack.indexOf(edge.to);
        const cycle = [...stack.slice(start), edge.to];
        issues.push({
          code: 'cycle',
          severity: 'error',
          nodeId: id,
          wireId: edge.wireId,
          message: `Cycle of ${cycle.length - 1} wire(s) detected in the graph: ${cycle.join(' -> ')}`,
          suggestion: `Remove wire "${edge.wireId}" to break the cycle`,
        });
      } else if (edgeState === 0) {
        visit(edge.to);
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of graphNodes) {
    if ((state.get(id) ?? 0) === 0) visit(id);
  }

  return issues;
}
