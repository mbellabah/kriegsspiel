import React from 'react';
import { Unit } from '../types/game';
import { echelonFor } from '../engine/natoSymbols';

// Inline APP-6 symbol for panels: same frames, fills and icons as the map.
export const UnitSymbol: React.FC<{ unit: Unit; hostile: boolean; size?: number }> = ({ unit, hostile, size = 34 }) => {
  const fill = hostile ? '#ff8080' : '#80e0ff';
  const stroke = '#1c1917';
  const w = 36;
  const h = 34;
  const cx = w / 2;
  const cy = 20;
  const fw = 24;
  const fh = 16;
  const r = 11;
  const clipId = `clip-${unit.id}`;
  const framePath = hostile
    ? `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`
    : `M${cx - fw / 2} ${cy - fh / 2} h${fw} v${fh} h${-fw} Z`;
  const ix = hostile ? 7.5 : fw / 2;
  const iy = hostile ? 7.5 : fh / 2;

  let icon: React.ReactNode = null;
  switch (unit.type) {
    case 'infantry':
    case 'guard':
      icon = (
        <path d={`M${cx - ix} ${cy - iy} L${cx + ix} ${cy + iy} M${cx + ix} ${cy - iy} L${cx - ix} ${cy + iy}`} />
      );
      break;
    case 'cavalry':
      icon = <path d={`M${cx - ix} ${cy + iy} L${cx + ix} ${cy - iy}`} />;
      break;
    case 'artillery':
      icon = <circle cx={cx} cy={cy} r={2.8} fill={stroke} />;
      break;
    case 'supply':
      icon = <path d={`M${cx - ix} ${cy + iy * 0.33} H${cx + ix}`} />;
      break;
    case 'headquarters':
      icon = <path d={`M${cx - 3.5} ${cy + 4} V${cy - 4.5} L${cx + 4} ${cy - 2.5} L${cx - 3.5} ${cy - 0.5}`} />;
      break;
  }

  return (
    <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <path d={framePath} />
        </clipPath>
      </defs>
      <text x={cx} y={hostile ? cy - r - 1.5 : cy - fh / 2 - 1.5} textAnchor="middle" fontSize="6.5" fontWeight="700" fill={stroke} fontFamily="IBM Plex Sans Condensed, Arial Narrow, sans-serif">
        {echelonFor(unit)}
      </text>
      <path d={framePath} fill={fill} stroke={stroke} strokeWidth={1.3} />
      <g clipPath={`url(#${clipId})`} stroke={stroke} strokeWidth={1.1} fill="none">
        {icon}
      </g>
    </svg>
  );
};
