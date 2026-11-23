import { artFor } from '../lib/buildingArt';
import { MINER_LOGO_DATA_URL, MINER_LOGO_KIND } from '../lib/minerLogo';

/**
 * Glifo compacto de edificio. La forma depende del `icon` del building data;
 * el dibujo vive en el catálogo procedural compartido con BuildingArt.
 * El Minero Mk.1 usa su logo raster sobre un calco técnico tenue.
 */
export function Glyph({
  kind,
  size = 26,
  color = 'currentColor',
}: {
  kind: string;
  size?: number;
  color?: string;
}) {
  const isLogo = kind === MINER_LOGO_KIND;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
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
