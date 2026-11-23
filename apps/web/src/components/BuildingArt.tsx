import { artFor } from '../lib/buildingArt';
import { logoDataUrl, logoKindForBuilding } from '../lib/minerLogo';

/**
 * Versión grande del glifo de edificio para tarjetas y vistas de detalle.
 * Comparte el catálogo procedural con Glyph y con el SVG exportado.
 * Los Mineros Mk.1 y Mk.2 muestran su logo raster sobre el calco técnico.
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
  const logoKind = logoKindForBuilding(kind);
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
      <g opacity={logoKind ? 0.25 : 1}>
        {artFor(logoKind ? 'miner' : kind).map((shape, index) => (
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
      {logoKind && (
        <image
          href={logoDataUrl(logoKind)}
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
