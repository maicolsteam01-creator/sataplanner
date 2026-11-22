#!/usr/bin/env node
/**
 * Importador de docs.json -> dataset normalizado de SataPlanner.
 *
 * Uso:
 *   1. Copiá el docs.json de la comunidad (SML) en data/raw/docs.json
 *   2. npm run data:import
 *   3. El resultado queda en data/normalized/game-data.json
 *
 * El script es defensivo: si el formato cambia, avisa que campos faltan
 * en lugar de romper. Los footprints NO vienen en docs.json, se toman de
 * data/curated/footprints.json (opcional) o quedan en 1x1 marcados como
 * no verificados.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const inputPath = path.resolve(argOf('--file', 'data/raw/docs.json'));
const curatedPath = path.resolve(argOf('--footprints', 'data/curated/footprints.json'));
const outputPath = path.resolve(argOf('--out', 'data/normalized/game-data.json'));
const gameVersion = argOf('--version', 'unknown');

const warn = (message) => console.warn(`  ! ${message}`);
const info = (message) => console.log(`  · ${message}`);

function toArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection === 'object') return Object.entries(collection).map(([key, value]) => ({ __key: key, ...value }));
  return [];
}

function shortId(value) {
  const last = String(value ?? '').split(/[./\\]/).pop() ?? '';
  return last
    .replace(/_[CR]$/, '')
    .replace(/^(Recipe|Desc|Build|Item)_/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

/**
 * El Docs.json oficial (y el de la comunidad) viene agrupado por NativeClass:
 *   [{ NativeClass: "/Script/FactoryGame.FGItemDescriptor", Classes: [...] }, ...]
 * Tambien aceptamos el formato plano { items: [...], recipes: [...], buildings: [...] }
 * que usan algunos mirrors y nuestros fixtures.
 */
function collect(docs) {
  if (!Array.isArray(docs)) {
    return {
      items: toArray(docs.items ?? docs.Items),
      recipes: toArray(docs.recipes ?? docs.Recipes),
      buildings: toArray(docs.buildings ?? docs.Buildings),
    };
  }

  const groups = { items: [], recipes: [], buildings: [] };
  for (const block of docs) {
    const native = String(block?.NativeClass ?? block?.nativeClass ?? '');
    const classes = toArray(block?.Classes ?? block?.classes);
    if (classes.length === 0) continue;
    if (/FGItemDescriptor/i.test(native)) groups.items.push(...classes);
    else if (/FGRecipe/i.test(native)) groups.recipes.push(...classes);
    else if (/FGBuildable/i.test(native)) groups.buildings.push(...classes);
  }
  return groups;
}

function parseItemList(text) {
  if (!text) return [];
  const results = [];
  const patterns = [
    /ItemClass="([^"]+)"\s*,\s*Amount=(\d+)/g,
    /ItemClass=([^,)\s]+)\s*,\s*Amount=(\d+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const itemId = shortId(match[1]);
      const qty = Number(match[2]);
      if (itemId && Number.isFinite(qty) && !results.some((entry) => entry.itemId === itemId)) {
        results.push({ itemId, qty });
      }
    }
    if (results.length > 0) break;
  }
  return results;
}

function parseBuildings(text) {
  if (!text) return [];
  const found = new Set();
  const pattern = /Build_[A-Za-z0-9_]+/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    found.add(shortId(match[0]));
  }
  return [...found];
}

function formOf(form) {
  if (form === 'RF_LIQUID') return 'liquid';
  if (form === 'RF_GAS') return 'gas';
  return 'solid';
}

function categoryOf(className) {
  if (/Miner|WaterPump|OilPump|Fracking|Resource/i.test(className)) return 'extraction';
  if (/Smelter|Foundry/i.test(className)) return 'smelting';
  if (/Generator|Power/i.test(className)) return 'power';
  if (/Refinery|Chemical|Mixer|Blender/i.test(className)) return 'chemistry';
  if (/Constructor|Assembler|Manufacturer|Packager|Converter|Quantum|Storage|Splitter|Merger|Conveyor|Pipeline|Docking/i.test(className)) return 'assembly';
  return 'logistics';
}

const name = (text, fallback) => {
  const value = String(text ?? '').trim();
  return value && value !== '""' ? value : fallback;
};

async function main() {
  console.log(`\nSataPlanner · importador de datos\n  entrada: ${inputPath}`);

  if (!existsSync(inputPath)) {
    console.error(`\nNo existe ${inputPath}.\nColocá el docs.json de la comunidad en esa ruta y volvé a intentar.`);
    process.exit(1);
  }

  const docs = JSON.parse(await readFile(inputPath, 'utf8'));
  const { items: itemsRaw, recipes: recipesRaw, buildings: buildingsRaw } = collect(docs);

  if (itemsRaw.length === 0) warn('no se encontraron items en docs.json');
  if (recipesRaw.length === 0) warn('no se encontraron recetas en docs.json');
  if (buildingsRaw.length === 0) warn('no se encontraron edificios en docs.json');

  const footprints = existsSync(curatedPath)
    ? JSON.parse(await readFile(curatedPath, 'utf8'))
    : {};
  if (Object.keys(footprints).length === 0) {
    warn(`sin footprints curados (${curatedPath}); todo queda en 1x1 no verificado`);
  }

  const items = itemsRaw
    .map((entry) => {
      const className = entry.ClassName ?? entry.__key;
      const label = name(entry.mDisplayName, null);
      if (!className || !label) return null;
      return {
        id: shortId(className),
        name: { en: label },
        form: formOf(entry.mForm),
        stackSize: Number(entry.mStackSize?.match?.(/\d+/)?.[0] ?? 0) || undefined,
        sinkPoints: Number(entry.mResourceSinkPoints) || undefined,
      };
    })
    .filter(Boolean);

  const buildingIds = new Set();
  const itemIds = new Set(items.map((item) => item.id));
  const buildingAlias = new Map();

  const buildings = buildingsRaw
    .map((entry) => {
      const className = entry.ClassName ?? entry.__key;
      if (!className) return null;
      const rawId = shortId(className);
      const label = name(entry.mDisplayName, null);
      if (!label) return null;
      const override = footprints[rawId] ?? footprints[className] ?? {};
      const id = override.id ?? rawId;
      buildingAlias.set(rawId, id);
      buildingIds.add(id);
      const powerBase = Number(entry.mPowerConsumption) || 0;
      const powerGeneration = Number(entry.mPowerProduction) || 0;
      return {
        id,
        name: { en: label },
        category: override.category ?? categoryOf(className),
        footprint: {
          w: Number(override.w) || 1,
          d: Number(override.d) || 1,
          h: Number(override.h) || 1,
        },
        powerBase,
        ...(powerGeneration > 0 ? { powerGeneration } : {}),
        inputs: [],
        outputs: [],
        beltTierMax: 6,
        pipeTierMax: 2,
        somersloopSlots: Number(override.somersloopSlots) || 0,
        shardSlots: Number(override.shardSlots) || 0,
        icon: override.icon ?? 'default',
        verified: Boolean(override.verified),
      };
    })
    .filter(Boolean);

  const missingItems = new Set();
  const unresolvedRecipes = [];

  const recipes = recipesRaw
    .map((entry) => {
      const className = entry.ClassName ?? entry.__key;
      const label = name(entry.mDisplayName, null);
      if (!className || !label) return null;
      const time = Number(entry.mManufactoringDuration ?? entry.mManufacturingDuration);
      const inputs = parseItemList(entry.mIngredients);
      const outputs = parseItemList(entry.mProduct ?? entry.mProducts);
      if (!Number.isFinite(time) || time <= 0 || outputs.length === 0) return null;

      for (const entryItem of [...inputs, ...outputs]) {
        if (!itemIds.has(entryItem.itemId)) missingItems.add(entryItem.itemId);
      }

      const producedIn = parseBuildings(entry.mProducedIn).map(
        (id) => buildingAlias.get(id) ?? id,
      );
      const known = producedIn.filter((id) => buildingIds.has(id));
      if (known.length === 0 && producedIn.length > 0) {
        unresolvedRecipes.push(label);
      }

      return {
        id: shortId(className),
        name: { en: label },
        buildingIds: known.length > 0 ? known : producedIn,
        time,
        inputs,
        outputs,
        alternate: /^alternate:/i.test(label) || /\balternate\b/i.test(label),
        verified: true,
      };
    })
    .filter(Boolean);

  const dataset = {
    gameVersion,
    generatedAt: new Date().toISOString(),
    source: path.basename(inputPath),
    items,
    recipes,
    buildings,
    transports: [
      { id: 'belt-mk1', name: { en: 'Conveyor Belt Mk.1' }, kind: 'belt', tier: 1, rate: 60, verified: true },
      { id: 'belt-mk2', name: { en: 'Conveyor Belt Mk.2' }, kind: 'belt', tier: 2, rate: 120, verified: true },
      { id: 'belt-mk3', name: { en: 'Conveyor Belt Mk.3' }, kind: 'belt', tier: 3, rate: 270, verified: true },
      { id: 'belt-mk4', name: { en: 'Conveyor Belt Mk.4' }, kind: 'belt', tier: 4, rate: 480, verified: true },
      { id: 'belt-mk5', name: { en: 'Conveyor Belt Mk.5' }, kind: 'belt', tier: 5, rate: 780, verified: true },
      { id: 'belt-mk6', name: { en: 'Conveyor Belt Mk.6' }, kind: 'belt', tier: 6, rate: 1200, verified: true },
      { id: 'pipe-mk1', name: { en: 'Pipeline Mk.1' }, kind: 'pipe', tier: 1, rate: 300, verified: true },
      { id: 'pipe-mk2', name: { en: 'Pipeline Mk.2' }, kind: 'pipe', tier: 2, rate: 600, verified: true },
    ],
    categories: [
      { id: 'extraction', name: { en: 'Extraction' }, color: '#7FD1FF' },
      { id: 'smelting', name: { en: 'Smelting' }, color: '#FFB347' },
      { id: 'assembly', name: { en: 'Assembly' }, color: '#5BE49B' },
      { id: 'chemistry', name: { en: 'Chemistry' }, color: '#C792EA' },
      { id: 'power', name: { en: 'Power' }, color: '#FFD166' },
      { id: 'logistics', name: { en: 'Logistics' }, color: '#8FA8BF' },
    ],
    balance: { powerExponent: 1.321928, somersloopBonus: 0.5, minClock: 1, maxClock: 250 },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(dataset, null, 2), 'utf8');

  info(`${items.length} items`);
  info(`${recipes.length} recetas`);
  info(`${buildings.length} edificios`);
  if (missingItems.size > 0) {
    warn(`${missingItems.size} items referenciados en recetas no están en la lista de items`);
  }
  if (unresolvedRecipes.length > 0) {
    warn(`${unresolvedRecipes.length} recetas apuntan a edificios desconocidos (ej: ${unresolvedRecipes[0]})`);
  }
  console.log(`\n  ✓ escrito ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
