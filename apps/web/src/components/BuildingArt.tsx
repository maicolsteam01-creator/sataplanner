import { artFor } from '../lib/buildingArt';
import { MINER_LOGO_DATA_URL, MINER_LOGO_KIND } from '../lib/minerLogo';

/**
 * Versión grande del glifo de edificio para tarjetas y vistas de detalle.
 * Comparte el catálogo procedural con Glyph y con el SVG exportado.
 * El Minero Mk.1 muestra su logo raster sobre el calco técnico.
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
  const isLogo = kind === MINER_LOGO_KIND;
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
      <g opacity={isLogo ? 0.25 : 1}>
        {artFor(isLogo ? 'miner' : kind).map((shape, index) => (
          <path
            key={index}
            d={shape.path}
            fill={shape.fill === 'currentColor' ? color : shape.fill ?? 'none'}
            stroke={!shape.stroke || shape.stroke === 'currentColor' ? color : shape.stroke}
            strokeWidth={shape.strokeWidth ?? 1.1}
            opacity={shape.opacity}
          />
        ))}
      </g>
      {isLogo && (
        <image
          href={MINER_LOGO_DATA_URL}
          x="4"
          y="4"
          width="24"
          height="24"
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </svg>
  );
}
