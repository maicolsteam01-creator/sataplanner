import { artFor } from '../lib/buildingArt';

/**
 * Versión grande del glifo de edificio para tarjetas y vistas de detalle.
 * Comparte el catálogo procedural con Glyph y con el SVG exportado.
 */
export function BuildingArt({
  kind,
  size = 48,
  color = '#7FD1FF',
  className,
}: {
  kind: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {artFor(kind).map((shape, index) => (
        <path
          key={index}
          d={shape.path}
          fill={shape.fill === 'currentColor' ? color : shape.fill ?? 'none'}
          stroke={!shape.stroke || shape.stroke === 'currentColor' ? color : shape.stroke}
          strokeWidth={shape.strokeWidth ?? 1.1}
          opacity={shape.opacity}
        />
      ))}
    </svg>
  );
}
