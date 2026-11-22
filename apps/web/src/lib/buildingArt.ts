/**
 * Arte procedural para los iconos de edificios.
 *
 * Todas las formas se definen en un viewBox de 32x32 y siguen la estetica del
 * plano: trazos finos, rejillas, remaches y rellenos muy tenues. No hay
 * dependencias externas ni recursos rasterizados; el mismo catalogo se usa en
 * la UI (Glyph / BuildingArt) y en el SVG autónomo.
 */

export interface ArtShape {
  path: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

const num = (value: number): string => String(Math.round(value * 100) / 100);

const circle = (cx: number, cy: number, r: number): string =>
  `M ${num(cx - r)} ${num(cy)} a ${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0 a ${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0 Z`;

/** Contorno principal, siempre visible incluso a 22px. */
const edge = (path: string, strokeWidth = 1.15): ArtShape => ({ path, strokeWidth });

/** Detalle de plano (rejillas, biseles, lineas de flujo). */
const fine = (path: string, strokeWidth = 0.8, opacity = 0.85): ArtShape => ({
  path,
  strokeWidth,
  opacity,
});

/** Relleno semitransparente del color del trazo. */
const wash = (path: string, opacity = 0.12): ArtShape => ({
  path,
  fill: 'currentColor',
  stroke: 'none',
  opacity,
});

/** Punto de tornillo / remache. */
const rivet = (cx: number, cy: number, r = 0.65): ArtShape => ({
  path: circle(cx, cy, r),
  fill: 'currentColor',
  stroke: 'none',
  opacity: 0.9,
});

const ART: Record<string, ArtShape[]> = {
  // Torre de perforación con corona, polea, brazo motor y broca.
  miner: [
    wash('M10 25 L12.5 9 H19.5 L22 25 Z', 0.1),
    edge('M10 25 L12.5 9 H19.5 L22 25 Z'),
    edge('M12.5 9 L16 4 L19.5 9'),
    edge('M16 4 V27', 1),
    edge('M13.5 24 L16 28 L18.5 24', 1),
    edge(circle(16, 8, 1.5), 0.8),
    fine('M12.9 13 H19.1 M12.4 17 H19.6 M11.8 21 H20.2'),
    edge('M5 20 H10 V25 H5 Z', 0.95),
    fine('M6.5 22 H8.5 M6.5 23.5 H8.5', 0.7),
    edge('M3 28 H29', 1),
    rivet(7.5, 20.8, 0.5),
  ],

  // Horno con chimenea lateral y ranuras de calor.
  smelter: [
    wash('M6 12 H24 V27 H6 Z', 0.11),
    edge('M6 12 H24 V27 H6 Z'),
    edge('M8 9 H22 L24 12 H6 Z', 1.05),
    edge('M20 3 H24 V9', 1.1),
    edge('M19 3 H25', 1),
    fine('M22 1 V2', 0.8, 0.6),
    fine('M10 17 H20 M10 20 H20 M10 23 H20', 1.05, 0.95),
    fine('M10 14 H14', 0.8),
    edge('M8 27 V29 M22 27 V29', 1),
    edge('M4 29 H28', 1),
    rivet(8, 14.5, 0.55),
    rivet(22, 14.5, 0.55),
  ],

  // Fundición con dos chimeneas, crisol y ondas de calor.
  foundry: [
    wash('M5 13 H27 V27 H5 Z', 0.1),
    edge('M5 13 H27 V27 H5 Z'),
    edge('M8 4 H12 V13', 1.1),
    edge('M20 4 H24 V13', 1.1),
    edge('M7 4 H13 M19 4 H25', 1),
    fine('M8 7 H12 M20 7 H24', 0.7, 0.7),
    wash('M11 19 H21 L19 26 H13 Z', 0.26),
    edge('M11 19 H21 L19 26 H13 Z', 1.05),
    fine('M12.5 22 H19.5', 0.8),
    fine('M14 16 q2 -2 4 0 M17 16 q2 -2 4 0', 0.8, 0.75),
    edge('M3 29 H29', 1),
    rivet(7.5, 24.5, 0.55),
    rivet(24.5, 24.5, 0.55),
  ],

  // Constructor: anillo de trabajo y brazo robótico con pinza.
  constructor: [
    wash('M6 13 H26 V27 H6 Z', 0.09),
    edge('M6 13 H26 V27 H6 Z'),
    edge(circle(16, 19, 5.4), 1.15),
    edge(circle(16, 19, 2.7), 0.9),
    fine('M16 11.6 V13.8 M16 24.2 V26.4 M8.6 19 H10.8 M21.2 19 H23.4', 0.85),
    edge('M9 5 H13 L17.5 10.5', 1.1),
    edge(circle(12, 5, 1), 0.8),
    fine('M17.5 10.5 L20 9 M17.5 10.5 L19.5 12.5', 0.9),
    edge('M23 5 L20.5 9', 1),
    fine('M9 25 H23', 0.8),
    edge('M4 29 H28', 1),
    rivet(8.5, 15.5, 0.5),
    rivet(23.5, 15.5, 0.5),
  ],

  // Ensamblador: dos bloques de producto y flecha de transferencia.
  assembler: [
    wash('M4 17 H15 V28 H4 Z', 0.11),
    edge('M4 17 H15 V28 H4 Z'),
    fine('M8 17 V28 M4 22.5 H15', 0.75, 0.8),
    wash('M17 4 H28 V15 H17 Z', 0.11),
    edge('M17 4 H28 V15 H17 Z'),
    fine('M21 4 V15 M17 9.5 H28', 0.75, 0.8),
    edge('M12.5 20 L19 13.5', 1.2),
    fine('M15.4 13.5 H19 V17.1', 1.05, 1),
    rivet(6, 19, 0.5),
    rivet(13, 26, 0.5),
    rivet(19, 6, 0.5),
    rivet(26, 13, 0.5),
  ],

  // Manufacturador: tres módulos escalonados con rejillas y testigos.
  manufacturer: [
    wash('M4 21 L6 19 H11 V28 H4 Z', 0.1),
    edge('M4 21 L6 19 H11 V28 H4 Z'),
    wash('M12 14 L14 12 H19 V28 H12 Z', 0.1),
    edge('M12 14 L14 12 H19 V28 H12 Z'),
    wash('M20 6 L22 4 H27 V28 H20 Z', 0.1),
    edge('M20 6 L22 4 H27 V28 H20 Z'),
    fine('M6 23 H9.5 M14 17 H17.5 M22 9 H25.5', 0.85),
    rivet(9.5, 25.5, 0.5),
    rivet(17.5, 22, 0.5),
    rivet(25, 14, 0.5),
    edge('M3 29 H29', 1),
  ],

  // Refinería: dos torres de destilación, tanque lateral y tuberías.
  refinery: [
    wash('M7 6 H13 V26 H7 Z', 0.1),
    edge('M7 6 H13 V26 H7 Z'),
    edge('M8 4 V6 H12 V4', 0.95),
    fine('M7 11 H13 M7 16 H13 M7 21 H13', 0.8, 0.9),
    wash('M15 10 H20 V26 H15 Z', 0.1),
    edge('M15 10 H20 V26 H15 Z'),
    edge('M16 8 V10 H19 V8', 0.9),
    fine('M15 14 H20 M15 18 H20 M15 22 H20', 0.8, 0.9),
    wash('M22 18 H28 V26 H22 Z', 0.14),
    edge('M22 18 H28 V26 H22 Z', 0.95),
    fine('M22 18 Q25 15.5 28 18', 0.9),
    fine('M22 22 H28', 0.8),
    edge('M13 12 H15 M20 22 H22', 0.9),
    edge('M4 28 H29', 1),
    rivet(8, 7.5, 0.45),
    rivet(18, 12, 0.45),
    rivet(25, 24.5, 0.45),
  ],

  // Empaquetador: caja abierta con cinta y flecha de salida.
  packager: [
    wash('M4 14 H19 V27 H4 Z', 0.1),
    edge('M4 14 H19 V27 H4 Z'),
    edge('M4 14 L7 10 H16 L19 14', 1.05),
    fine('M4 18 H19 M11.5 14 V27', 0.8, 0.85),
    wash('M7 21 H11 V25 H7 Z', 0.18),
    edge('M7 21 H11 V25 H7 Z', 0.85),
    fine('M9 21 V25 M7 23 H11', 0.7, 0.8),
    edge('M21 20 H28', 1.15),
    fine('M25 17 L28 20 L25 23', 1.05, 1),
    edge('M3 29 H29', 1),
    rivet(6, 16, 0.5),
    rivet(17, 16, 0.5),
  ],

  // Generador: carcasa con aletas de refrigeración y rayo.
  generator: [
    wash('M5 9 H27 V27 H5 Z', 0.1),
    edge('M5 9 H27 V27 H5 Z'),
    edge('M7 6 H25 L27 9 H5 Z', 1.05),
    fine('M7 13 H11 M7 16 H11 M7 19 H11 M7 22 H11', 0.8, 0.85),
    wash('M18 11 L12 20 H16 L14 25 L21 15 H17 Z', 0.55),
    edge('M18 11 L12 20 H16 L14 25 L21 15 H17 Z', 0.9),
    edge('M3 29 H29', 1),
    rivet(7, 26, 0.55),
    rivet(25, 26, 0.55),
  ],

  // Almacenamiento: contenedor reforzado con costillas y arriostres.
  storage: [
    wash('M5 8 H27 V27 H5 Z', 0.1),
    edge('M5 8 H27 V27 H5 Z'),
    fine('M5 12 H27 M5 24 H27', 0.9, 0.95),
    fine('M11 8 V27 M21 8 V27', 0.85, 0.9),
    fine('M11 12 L21 24 M21 12 L11 24', 0.8, 0.75),
    edge('M5 8 L7 6 H11 M27 8 L25 6 H21', 0.9),
    edge('M3 29 H29', 1),
    rivet(7.5, 10, 0.5),
    rivet(24.5, 10, 0.5),
    rivet(7.5, 26, 0.5),
    rivet(24.5, 26, 0.5),
  ],

  // Splitter: una entrada, núcleo y tres salidas en abanico.
  splitter: [
    wash(circle(13, 16, 3), 0.16),
    edge(circle(13, 16, 3), 1.15),
    edge(circle(13, 16, 1.1), 0.8),
    edge('M3 16 H10', 1.2),
    fine('M7 13.5 L10 16 L7 18.5', 1, 1),
    edge('M16 16 H25', 1.2),
    fine('M22 13.5 L25 16 L22 18.5', 1, 1),
    edge('M15.5 14 L23 7', 1.15),
    fine('M19.5 7 H23 V10.5', 1, 1),
    edge('M15.5 18 L23 25', 1.15),
    fine('M19.5 25 H23 V21.5', 1, 1),
  ],

  // Merger: tres entradas en abanico y una única salida.
  merger: [
    edge('M2 6 H5 V9 H2 Z', 0.9),
    edge('M2 14.5 H5 V17.5 H2 Z', 0.9),
    edge('M2 23 H5 V26 H2 Z', 0.9),
    wash(circle(13, 16, 3), 0.16),
    edge(circle(13, 16, 3), 1.15),
    edge(circle(13, 16, 1.1), 0.8),
    edge('M5 7.5 L10 15 M5 16 H10 M5 24.5 L10 17', 1.15),
    edge('M16 16 H28', 1.2),
    fine('M25 13.5 L28 16 L25 18.5', 1, 1),
  ],

  // Agua: gota con reflejo y dos lineas de onda.
  water: [
    wash('M16 4 C13 9 9 13 9 17 A7 7 0 0 0 23 17 C23 13 19 9 16 4 Z', 0.12),
    edge('M16 4 C13 9 9 13 9 17 A7 7 0 0 0 23 17 C23 13 19 9 16 4 Z', 1.15),
    fine('M12.5 17 A3.5 3.5 0 0 0 16 20.5', 0.9),
    fine('M4 26 Q7 24 10 26 T16 26 T22 26 T28 26', 1, 0.9),
    fine('M4 29 Q7 27 10 29 T16 29 T22 29 T28 29', 0.9, 0.7),
    rivet(19.5, 16, 0.5),
    rivet(21, 13.5, 0.4),
  ],

  // Comodín: hexágono técnico con ejes de referencia.
  default: [
    wash('M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z', 0.1),
    edge('M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z', 1.15),
    fine('M16 9 L22 12.5 V19.5 L16 23 L10 19.5 V12.5 Z', 0.85, 0.8),
    fine('M16 3 V29 M5 9.5 L27 22.5 M27 9.5 L5 22.5', 0.7, 0.4),
    rivet(16, 16, 1),
  ],
};

/** Devuelve una copia de las formas para que el llamador no pueda mutar el catálogo. */
export function artFor(kind: string): ArtShape[] {
  const shapes = ART[kind] ?? ART.default ?? [];
  return shapes.map((shape) => ({ ...shape }));
}

const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const attrNumber = (value: number, fallback: number): string =>
  Number.isFinite(value) ? num(value) : num(fallback);

/** SVG independiente (xml válido, sin comillas dobles dentro de los atributos). */
export function artSvg(kind: string, size = 48, color = '#7FD1FF'): string {
  const width = attrNumber(size, 48);
  const stroke = escapeAttr(color);
  const paths = artFor(kind)
    .map((shape) => {
      const fill = shape.fill === 'currentColor' ? color : shape.fill ?? 'none';
      const shapeStroke =
        !shape.stroke || shape.stroke === 'currentColor' ? color : shape.stroke;
      const sw = attrNumber(shape.strokeWidth ?? 1.1, 1.1);
      const opacity =
        shape.opacity !== undefined && Number.isFinite(shape.opacity)
          ? ` opacity="${attrNumber(Math.min(1, Math.max(0, shape.opacity)), 1)}"`
          : '';
      return `<path d="${escapeAttr(shape.path)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(shapeStroke)}" stroke-width="${sw}"${opacity} />`;
    })
    .join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 32 32" fill="none" stroke="${stroke}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`,
    paths,
    '</svg>',
  ].join('\n');
}
