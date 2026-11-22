import { sampleGameData } from '@sataplanner/game-data';
import type { Doc } from '../types';

/** Utilidades de exportacion: archivos, PNG en alta resolucion, PDF y link. */

export function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'plano'
  );
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadSvg(filename: string, svg: string): void {
  downloadBlob(filename, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
}

/** Rasteriza el SVG del plano a PNG (2x) sin depender del canvas de pantalla. */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      try {
        const width = image.naturalWidth || 1680;
        const height = image.naturalHeight || 1180;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2D context');
        ctx.fillStyle = '#081724';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error('No PNG blob'));
          },
          'image/png',
          1,
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG could not be rasterized'));
    };
    image.src = url;
  });
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Abre el dialogo de impresion del navegador con el plano en A3 horizontal.
 * El destino "Guardar como PDF" produce el PDF tecnico sin dependencias.
 */
export function printBlueprint(svg: string, title: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A3 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; background: #081724; }
  svg { display: block; width: 100vw; height: 100vh; }
</style></head><body>${svg}</body></html>`);
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.setTimeout(() => frame.remove(), 300);
  };

  const trigger = () => {
    win.focus();
    win.print();
  };

  win.addEventListener('afterprint', cleanup);
  if (doc.readyState === 'complete') {
    window.setTimeout(trigger, 350);
  } else {
    win.addEventListener('load', () => window.setTimeout(trigger, 250));
  }
  window.setTimeout(cleanup, 120_000);
}

// ---------- Link compartible (comprimido, nunca viaja al servidor) ----------

const DOC_PARAM = '#p=';

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function deflate(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

export async function buildShareLink(doc: Doc): Promise<string> {
  const payload = JSON.stringify({
    v: 1,
    n: doc.nodes,
    w: doc.wires,
    m: doc.meta.name,
    g: doc.gameVersion,
  });
  const packed = await deflate(payload);
  const token = packed
    ? `z${toBase64Url(packed)}`
    : `j${toBase64Url(new TextEncoder().encode(payload))}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}${DOC_PARAM}${token}`;
}

export async function readShareLink(hash = window.location.hash): Promise<Doc | null> {
  if (!hash.startsWith(DOC_PARAM)) return null;
  const token = hash.slice(DOC_PARAM.length);
  if (token.length < 2) return null;

  try {
    const kind = token[0];
    const bytes = fromBase64Url(token.slice(1));
    const json = kind === 'z' && typeof DecompressionStream !== 'undefined'
      ? await inflate(bytes)
      : new TextDecoder().decode(bytes);
    const raw = JSON.parse(json) as {
      n?: unknown;
      w?: unknown;
      m?: unknown;
      g?: unknown;
    };
    if (!Array.isArray(raw.n) || !Array.isArray(raw.w)) return null;

    return {
      schemaVersion: 1,
      gameVersion: typeof raw.g === 'string' ? raw.g : sampleGameData.gameVersion,
      nodes: raw.n as Doc['nodes'],
      wires: raw.w as Doc['wires'],
      meta: {
        name: typeof raw.m === 'string' && raw.m ? raw.m : 'Plano compartido',
        updatedAt: new Date().toISOString(),
      },
    };
  } catch {
    return null;
  }
}

export function clearShareHash(): void {
  if (!window.location.hash.startsWith(DOC_PARAM)) return;
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', url);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Navegadores sin permiso de portapapeles: seleccionamos y copiamos a mano.
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
