import { MINER_LOGO_BASE64 } from './minerLogoBase64';
import { MINER_MK2_LOGO_BASE64 } from './minerMk2LogoBase64';

/**
 * Logos raster de los Mineros Mk.1 y Mk.2. Se usan en catálogo, lienzo y SVG
 * exportado. Van como data URL para que funcionen offline y para que el plano
 * exportado sea autosuficiente (sin dependencias externas).
 */
export type MinerLogoKind = 'miner-mk1' | 'miner-mk2';

const DATA_URLS: Record<MinerLogoKind, string> = {
  'miner-mk1': `data:image/webp;base64,${MINER_LOGO_BASE64}`,
  'miner-mk2': `data:image/jpeg;base64,${MINER_MK2_LOGO_BASE64}`,
};

const FILE_URLS: Record<MinerLogoKind, string> = {
  'miner-mk1': `${import.meta.env.BASE_URL}miner-mk1.webp`,
  'miner-mk2': `${import.meta.env.BASE_URL}miner-mk2.jpg`,
};

export function logoKindForBuilding(buildingId: string): MinerLogoKind | null {
  if (buildingId === 'miner-mk1') return 'miner-mk1';
  if (buildingId === 'miner-mk2') return 'miner-mk2';
  return null;
}

export function logoDataUrl(kind: MinerLogoKind): string {
  return DATA_URLS[kind];
}

export function logoFileUrl(kind: MinerLogoKind): string {
  return FILE_URLS[kind];
}

const images = new Map<MinerLogoKind, HTMLImageElement>();
const listeners = new Map<MinerLogoKind, Set<() => void>>();

/** Imagen ya decodificada, o null mientras carga. */
export function logoImage(kind: MinerLogoKind): HTMLImageElement | null {
  const image = images.get(kind);
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

/** Avisa cuando la imagen está lista para repintar el lienzo. */
export function onLogoReady(kind: MinerLogoKind, listener: () => void): () => void {
  if (logoImage(kind)) {
    listener();
    return () => undefined;
  }
  const set = listeners.get(kind) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(kind, set);
  return () => set.delete(listener);
}

if (typeof Image !== 'undefined') {
  (Object.keys(DATA_URLS) as MinerLogoKind[]).forEach((kind) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => listeners.get(kind)?.forEach((listener) => listener());
    image.src = DATA_URLS[kind];
    images.set(kind, image);
  });
}
