import React, { useState, useMemo } from 'react';
import { Vector2D, Unit } from '../types/game';
import { headingToBearing, getCardinalDirection } from '../engine/tacticalNavigation';
import { Compass, ChevronDown, ChevronUp, Navigation, ArrowUpRight, Copy, Check } from 'lucide-react';

interface TacticalCompassProps {
  selectedUnit?: Unit | null;
  hoverCoords?: Vector2D | null;
  onInsertCompassText?: (text: string) => void;
  className?: string;
  isDrawingBearing?: boolean;
  onToggleDrawBearing?: () => void;
  activeBearing?: number | null;
  activeBearingDistance?: number | null;
}

export const TacticalCompass: React.FC<TacticalCompassProps> = ({
  selectedUnit,
  hoverCoords,
  onInsertCompassText,
  className = '',
  isDrawingBearing = false,
  onToggleDrawBearing,
  activeBearing = null,
  activeBearingDistance = null,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);

  // Unit heading in compass bearing degrees (0° - 360°)
  const unitBearing = useMemo(() => {
    if (!selectedUnit || selectedUnit.heading === undefined) return null;
    return headingToBearing(selectedUnit.heading);
  }, [selectedUnit]);

  // Bearing from reference point (selected unit position or map center) to current mouse cursor
  const cursorBearing = useMemo(() => {
    if (!hoverCoords) return null;
    const refX = selectedUnit ? selectedUnit.position.x : 1000;
    const refY = selectedUnit ? selectedUnit.position.y : 750;
    const dx = hoverCoords.x - refX;
    const dy = hoverCoords.y - refY;
    if (Math.hypot(dx, dy) < 15) return null;
    const mathAngle = Math.atan2(dy, dx);
    return headingToBearing(mathAngle);
  }, [hoverCoords, selectedUnit]);

  // Primary active bearing priority:
  // 1. Explicit drawn bearing from arrow tool
  // 2. Selected unit's heading
  // 3. Hover cursor bearing
  const displayBearing = activeBearing !== null 
    ? activeBearing 
    : unitBearing !== null 
    ? unitBearing 
    : cursorBearing !== null 
    ? cursorBearing 
    : 0;

  const displayCardinal = getCardinalDirection(displayBearing);

  const displayContext = activeBearing !== null
    ? 'DRAWN BEARING'
    : unitBearing !== null
    ? 'UNIT HEADING'
    : cursorBearing !== null
    ? 'CURSOR AZIMUTH'
    : 'TRUE NORTH';

  const formattedDistance = useMemo(() => {
    if (activeBearingDistance === null || activeBearingDistance === undefined) return null;
    const d = Math.round(activeBearingDistance);
    return d >= 1000 ? `${(d / 1000).toFixed(1)}km` : `${d}m`;
  }, [activeBearingDistance]);

  const formattedBearingText = useMemo(() => {
    const brgStr = String(displayBearing).padStart(3, '0');
    if (activeBearingDistance && activeBearing !== null) {
      return `on bearing ${brgStr}° (${displayCardinal.code}, ${displayCardinal.mils} mils) for ${Math.round(activeBearingDistance)}m`;
    }
    return `on bearing ${brgStr}° (${displayCardinal.code}, ${displayCardinal.mils} mils)`;
  }, [displayBearing, displayCardinal, activeBearingDistance, activeBearing]);

  const handleCopyBearing = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(formattedBearingText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleInsertToDispatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInsertCompassText) {
      onInsertCompassText(formattedBearingText);
    }
  };

  return (
    <aside
      aria-label="Tactical Compass"
      className={`bg-[#fbfbfa] border border-[#a1a1aa] shadow-md rounded text-neutral-900 font-sans select-none overflow-hidden transition-all duration-150 pointer-events-auto w-52 ${className}`}
    >
      {/* Header Strip */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#e4e4e7] border-b border-[#a1a1aa] text-[10px] font-mono">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <Compass size={12} className="text-[#1e3a8a]" />
          <span className="uppercase tracking-wider">Tactical Compass</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-0.5 hover:bg-[#d4d4d8] text-neutral-600 hover:text-black rounded transition-colors cursor-pointer"
            title={isMinimized ? 'Expand Compass' : 'Minimize Compass'}
          >
            {isMinimized ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-2 flex flex-col items-center">
          {/* Main Dial & Digital Readout Container */}
          <div className="flex items-center justify-between w-full px-1">
            {/* Minimalist NATO Compass Dial (70x70) */}
            <div className="relative w-18 h-18 flex items-center justify-center">
              <svg
                viewBox="0 0 80 80"
                className="w-full h-full drop-shadow-2xs"
                style={{ overflow: 'visible' }}
              >
                {/* Outer Bezel Ring */}
                <circle cx="40" cy="40" r="38" fill="#f4f4f5" stroke="#71717a" strokeWidth="1.2" />
                <circle cx="40" cy="40" r="34" fill="#ffffff" stroke="#d4d4d8" strokeWidth="0.8" />

                {/* NATO Mil Dial Ticks (Every 30 degrees / ~533 mils) */}
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                  <line
                    key={deg}
                    x1="40"
                    y1="5"
                    x2="40"
                    y2={deg % 90 === 0 ? '11' : '8'}
                    stroke={deg === 0 ? '#dc2626' : deg % 90 === 0 ? '#52525b' : '#a1a1aa'}
                    strokeWidth={deg === 0 ? '1.5' : deg % 90 === 0 ? '1.1' : '0.7'}
                    transform={`rotate(${deg}, 40, 40)`}
                  />
                ))}

                {/* Subtle Intercardinal Markers (NE, SE, SW, NW) */}
                <text x="61" y="24" textAnchor="middle" fontSize="4.5" fill="#a1a1aa" fontFamily="monospace">NE</text>
                <text x="61" y="61" textAnchor="middle" fontSize="4.5" fill="#a1a1aa" fontFamily="monospace">SE</text>
                <text x="19" y="61" textAnchor="middle" fontSize="4.5" fill="#a1a1aa" fontFamily="monospace">SW</text>
                <text x="19" y="24" textAnchor="middle" fontSize="4.5" fill="#a1a1aa" fontFamily="monospace">NW</text>

                {/* Major Cardinal Letters */}
                <text x="40" y="19" textAnchor="middle" fontSize="7.5" fontWeight="bold" fill="#dc2626" fontFamily="monospace">N</text>
                <text x="64" y="42.5" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#52525b" fontFamily="monospace">E</text>
                <text x="40" y="66" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#52525b" fontFamily="monospace">S</text>
                <text x="16" y="42.5" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#52525b" fontFamily="monospace">W</text>

                {/* Rotating Azimuth Needle */}
                <g transform={`rotate(${displayBearing}, 40, 40)`}>
                  {/* North/Aiming Pointer (High-visibility Cobalt Blue with Center Ridge) */}
                  <polygon points="40,14 43.5,40 40,37" fill="#1e3a8a" />
                  <polygon points="40,14 36.5,40 40,37" fill="#2563eb" />
                  {/* South Counterbalance (Slate) */}
                  <polygon points="40,66 42.5,40 40,43" fill="#64748b" />
                  <polygon points="40,66 37.5,40 40,43" fill="#94a3b8" />
                </g>

                {/* Center Pivot */}
                <circle cx="40" cy="40" r="3.5" fill="#1e293b" />
                <circle cx="40" cy="40" r="1.5" fill="#f8fafc" />
              </svg>
            </div>

            {/* Live Readout & Context */}
            <div className="flex flex-col items-end justify-center">
              <div className="text-[7.5px] font-mono text-neutral-500 uppercase tracking-tight">
                {displayContext}
              </div>
              <div className="text-base font-mono font-black text-neutral-900 tracking-tight flex items-baseline gap-1">
                <span>{String(displayBearing).padStart(3, '0')}°</span>
                <span className="text-xs text-[#1e3a8a]">{displayCardinal.code}</span>
              </div>
              <div className="text-[8.5px] font-mono text-neutral-500 font-semibold">
                {displayCardinal.mils} mil
              </div>
              {formattedDistance && (
                <div className="text-[9px] font-mono font-bold text-blue-700 bg-blue-50 px-1 rounded mt-0.5 border border-blue-200">
                  {formattedDistance}
                </div>
              )}
            </div>
          </div>

          {/* Action Button: Draw Bearing Arrow Tool */}
          <div className="w-full mt-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={onToggleDrawBearing}
              className={`w-full flex items-center justify-center gap-1.5 py-1 px-1.5 text-[9px] font-mono font-bold uppercase transition-colors cursor-pointer border shadow-2xs ${
                isDrawingBearing
                  ? 'bg-[#ea580c] hover:bg-[#c2410c] text-white border-[#9a3412] animate-pulse'
                  : 'bg-white hover:bg-neutral-100 text-neutral-800 border-neutral-300'
              }`}
              title="Click on map to draw bearing arrow (Hotkey: B)"
            >
              <Navigation size={10} className={isDrawingBearing ? 'rotate-45' : ''} />
              <span>{isDrawingBearing ? 'DRAWING ARROW... (ESC)' : 'DRAW BEARING (B)'}</span>
            </button>

            {/* Quick Actions Strip: Copy & Insert into Dispatch */}
            <div className="flex items-center gap-1 w-full">
              <button
                type="button"
                onClick={handleCopyBearing}
                className="flex-1 flex items-center justify-center gap-1 py-0.5 px-1 bg-white hover:bg-neutral-100 border border-neutral-300 text-[8.5px] font-mono font-bold text-neutral-700 transition-colors cursor-pointer"
                title="Copy bearing text to clipboard"
              >
                {copied ? <Check size={9} className="text-green-600" /> : <Copy size={9} />}
                <span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>

              <button
                type="button"
                onClick={handleInsertToDispatch}
                disabled={!onInsertCompassText}
                className="flex-1 flex items-center justify-center gap-1 py-0.5 px-1 bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#93c5fd] text-[8.5px] font-mono font-bold text-[#1e3a8a] transition-colors cursor-pointer disabled:opacity-50"
                title="Send bearing directly to Imperial Dispatch Desk"
              >
                <ArrowUpRight size={9} />
                <span>+ DISPATCH</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
