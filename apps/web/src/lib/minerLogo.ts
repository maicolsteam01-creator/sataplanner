import { MINER_LOGO_BASE64 } from './minerLogoBase64';

/**
 * Logo raster del Minero Mk.1. Se usa en el catálogo, en el lienzo y en el SVG
 * exportado. Va como data URL para que la app siga funcionando offline y para
 * que el plano exportado sea autosuficiente (sin dependencias externas).
 */
export const MINER_LOGO_KIND = 'miner-mk1';
export const MINER_LOGO_DATA_URL = `data:image/webp;base64,${MINER_LOGO_BASE64}`;
export const MINER_LOGO_FILE_URL = `${import.meta.env.BASE_URL}miner-mk1.webp`;

let cached: HTMLImageElement | null = null;
const listeners = new Set<() => void>();

/** Imagen ya decodificada, o null mientras carga. */
export function minerLogoImage(): HTMLImageElement | null {
  return cached?.complete && cached.naturalWidth > 0 ? cached : null;
}

/** Avisa cuando la imagen está lista para repintar el lienzo. */
export function onMinerLogoReady(listener: () => void): () => void {
  if (minerLogoImage()) {
    listener();
    return () => undefined;
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof Image !== 'undefined') {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => listeners.forEach((listener) => listener());
  image.src = MINER_LOGO_DATA_URL;
  cached = image;
}
