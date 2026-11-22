/**
 * Contrato de datos del juego.
 *
 * Regla de oro: ningun numero del juego se escribe a mano en la UI.
 * Todo sale de este paquete, que a su vez se regenera desde docs.json
 * con `npm run data:import`.
 */

export type Locale = 'en' | 'es' | 'ja';

export type LocalizedText = {
  en: string;
  es?: string;
  ja?: string;
};

export type ItemForm = 'solid' | 'liquid' | 'gas';

export type Category =
  | 'extraction'
  | 'smelting'
  | 'assembly'
  | 'chemistry'
  | 'power'
  | 'logistics';

export type Side = 'n' | 'e' | 's' | 'w';

export type TransportKind = 'belt' | 'pipe';

export interface Item {
  id: string;
  name: LocalizedText;
  form: ItemForm;
  stackSize?: number;
  sinkPoints?: number;
}

export interface Ingredient {
  itemId: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: LocalizedText;
  buildingIds: string[];
  /** Segundos de un ciclo a 100% de clock. */
  time: number;
  inputs: Ingredient[];
  outputs: Ingredient[];
  alternate: boolean;
  /** false = numero pendiente de verificar contra la version actual del juego. */
  verified: boolean;
}

export interface Port {
  id: string;
  kind: TransportKind;
  side: Side;
  /** Posicion 0..1 a lo largo del lado. */
  offset: number;
}

export interface Footprint {
  /** Ancho en foundations. */
  w: number;
  /** Profundidad en foundations. */
  d: number;
  /** Altura en foundations. */
  h: number;
}

export interface Building {
  id: string;
  name: LocalizedText;
  category: Category;
  footprint: Footprint;
  /** Consumo en MW a 100% de clock. */
  powerBase: number;
  /** Generacion en MW a 100% (solo generadores). */
  powerGeneration?: number;
  inputs: Port[];
  outputs: Port[];
  beltTierMax: number;
  pipeTierMax: number;
  somersloopSlots: number;
  shardSlots: number;
  /** Identificador del glifo de arte tecnico. */
  icon: string;
  verified: boolean;
}

export interface Transport {
  id: string;
  name: LocalizedText;
  kind: TransportKind;
  tier: number;
  /** Items/min para belts, m3/min para pipes. */
  rate: number;
  verified: boolean;
}

export interface CategoryInfo {
  id: Category;
  name: LocalizedText;
  color: string;
}

export interface Balance {
  /** Exponente de la curva de energia de Satisfactory. */
  powerExponent: number;
  /** Bonus de produccion por Somersloop (fraccion). */
  somersloopBonus: number;
  minClock: number;
  maxClock: number;
}

export interface GameData {
  gameVersion: string;
  generatedAt: string;
  source: string;
  items: Item[];
  recipes: Recipe[];
  buildings: Building[];
  transports: Transport[];
  categories: CategoryInfo[];
  balance: Balance;
}
