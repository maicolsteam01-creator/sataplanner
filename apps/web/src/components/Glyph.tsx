import { artFor } from '../lib/buildingArt';

/**
 * Glifo compacto de edificio. La forma depende del `icon` del building data;
 * el dibujo vive en el catálogo procedural compartido con BuildingArt.
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
