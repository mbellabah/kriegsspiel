import React, { useState } from 'react';
import { Vector2D, Unit, TargetReferencePoint } from '../types/game';
import { GlyphClose, GlyphChevron } from './glyphs';
import { sounds } from '../engine/soundEffects';

interface TacticalContextMenuProps {
  screenPos: { x: number; y: number };
  worldCoords: Vector2D;
  bearing: number | null;
  cardinal: string | null;
  selectedUnit: Unit | null;
  elevation?: number;
  activeTrp?: TargetReferencePoint | null;
  availableTrps?: TargetReferencePoint[];
  onClose: () => void;
  onInsertToDispatch?: (text: string) => void;
  onPinpointTarget?: (coords: Vector2D) => void;
  onRelocateTrp?: (trpId: string, coords: Vector2D) => void;
  onRegisterTrp?: (name: string, coords: Vector2D) => void;
}

export const TacticalContextMenu: React.FC<TacticalContextMenuProps> = ({
  screenPos,
  worldCoords,
  bearing,
  cardinal,
  selectedUnit,
  elevation = 240,
  activeTrp = null,
  availableTrps = [],
  onClose,
  onInsertToDispatch,
  onPinpointTarget,
  onRelocateTrp,
  onRegisterTrp,
}) => {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [showRelocateList, setShowRelocateList] = useState(false);

  const roundedX = Math.round(worldCoords.x);
  const roundedY = Math.round(worldCoords.y);
  const coordStr = `(${roundedX}, ${roundedY})`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedLabel(label);
    try {
      sounds.playDispatchStamp();
    } catch {}
    setTimeout(() => {
      onClose();
    }, 450);
  };

  // Adjust menu position so it doesn't clip screen edges
  const menuW = 245;
  const menuH = showRelocateList ? 340 : (selectedUnit?.type === 'infantry' ? 360 : 250);
  const left = Math.min(window.innerWidth - menuW - 12, Math.max(12, screenPos.x + 8));
  const top = Math.min(window.innerHeight - menuH - 12, Math.max(12, screenPos.y - 10));

  return (
    <div
      className="fixed z-50 bg-[#fbfbfa] border-2 border-[#1e3a8a] shadow-sm text-black font-sans select-none overflow-hidden animate-in fade-in zoom-in-95 duration-100 w-[245px]"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#e4e4e7] border-b border-[#a1a1aa] text-[10px] font-mono">
        <div className="flex items-center gap-1.5 font-bold text-[#1e3a8a] truncate pr-2">
          <span className="truncate">{activeTrp ? `[${activeTrp.code}] ${activeTrp.name}` : `GRID ${coordStr}`}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 hover:bg-[#d4d4d8] text-neutral-600 hover:text-black cursor-pointer shrink-0"
        >
          <GlyphClose size={11} />
        </button>
      </div>

      {/* Telemetry info sub-bar */}
      <div className="px-2.5 py-1 bg-blue-50/80 border-b border-blue-200 text-[9px] font-mono text-neutral-700 flex items-center justify-between">
        <span>Elev: {elevation}m ASL</span>
        {activeTrp ? (
          <span className="font-bold text-amber-800">Pre-sighted TRP</span>
        ) : bearing !== null && cardinal ? (
          <span className="font-bold text-[#1e3a8a]">
            BRG: {String(bearing).padStart(3, '0')}° ({cardinal})
          </span>
        ) : (
          <span className="text-neutral-500 font-bold">Grid</span>
        )}
      </div>

      {/* Action Options */}
      <div className="p-1 space-y-0.5 text-xs font-mono">
        {/* If clicked on an existing TRP */}
        {activeTrp ? (
          <>
            {/* TRP Option 1: Send TRP to Dispatch */}
            <button
              type="button"
              onClick={() => {
                const cmdName = selectedUnit?.commander
                  ? `@${selectedUnit.commander.split(' ').pop()}, `
                  : '';
                const dispatchText = `${cmdName}advance to ${activeTrp.code}`;
                onInsertToDispatch?.(dispatchText);
                setCopiedLabel('trp_dispatch');
                try {
                  sounds.playDispatchStamp();
                } catch {}
                setTimeout(() => onClose(), 350);
              }}
              className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-blue-50 text-left cursor-pointer transition-colors text-neutral-900"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#1e3a8a]">Insert TRP into dispatch</span>
              </div>
              {copiedLabel === 'trp_dispatch' && (
                <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                  Inserted
                </span>
              )}
            </button>

            {/* TRP Option 2: Copy TRP Tag */}
            <button
              type="button"
              onClick={() => copyToClipboard(`${activeTrp.code} (${Math.round(activeTrp.position.x)}, ${Math.round(activeTrp.position.y)})`, 'trp_tag')}
              className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer transition-colors text-neutral-900 group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold">Copy TRP reference</span>
              </div>
              {copiedLabel === 'trp_tag' ? (
                <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                  Copied
                </span>
              ) : (
                <span className="text-neutral-600 font-normal text-[9px]">{activeTrp.code}</span>
              )}
            </button>

            {/* TRP Option 3: Drag & Drop Guidance */}
            <div className="px-2 py-1.5 bg-amber-50/70 border border-amber-200/80 text-[10px] text-amber-900 font-sans flex items-start gap-1.5 my-1">
              <span>Left-click and drag this marker across the map to relocate anytime.</span>
            </div>
          </>
        ) : (
          <>
            {/* Ground Option 1: Register new TRP here */}
            {onRegisterTrp && (
              <button
                type="button"
                onClick={() => {
                  const nextCode = `TRP ${String(availableTrps.length + 1).padStart(2, '0')}`;
                  onRegisterTrp(nextCode, worldCoords);
                  try {
                    sounds.playDispatchStamp();
                  } catch {}
                  onClose();
                }}
                className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-amber-50 text-left cursor-pointer transition-colors text-neutral-900 group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-amber-900">Register new TRP here</span>
                </div>
                <span className="text-neutral-500 font-normal text-[9px]">TRP {String(availableTrps.length + 1).padStart(2, '0')}</span>
              </button>
            )}

            {/* Ground Option 2: Relocate Existing TRP Here */}
            {onRelocateTrp && availableTrps.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowRelocateList(!showRelocateList)}
                  className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer transition-colors text-neutral-900"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold">Relocate TRP here…</span>
                  </div>
                  <GlyphChevron dir={showRelocateList ? 'up' : 'down'} size={10} className="text-neutral-500" />
                </button>

                {showRelocateList && (
                  <div className="ml-4 pl-1.5 border-l border-neutral-300 space-y-0.5 my-1">
                    {availableTrps.map((trp) => (
                      <button
                        key={trp.id}
                        type="button"
                        onClick={() => {
                          onRelocateTrp(trp.id, worldCoords);
                          try {
                            sounds.playDispatchStamp();
                          } catch {}
                          onClose();
                        }}
                        className="w-full px-1.5 py-1 text-left text-[10px] hover:bg-blue-50 text-neutral-800 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-bold text-[#1e3a8a]">{trp.code}</span>
                        <span className="text-neutral-500 truncate max-w-[130px]">{trp.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ground Option 3: Copy coordinates */}
            <button
              type="button"
              onClick={() => copyToClipboard(coordStr, 'coords')}
              className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer transition-colors text-neutral-900 group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold">Copy coordinates</span>
              </div>
              {copiedLabel === 'coords' ? (
                <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                  Copied
                </span>
              ) : (
                <span className="text-neutral-600 font-normal text-[9px]">{coordStr}</span>
              )}
            </button>

            {/* Ground Option 4: Copy Bearing & Heading */}
            {bearing !== null && cardinal && (
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `Bearing ${String(bearing).padStart(3, '0')}° (${cardinal}) to ${coordStr}`,
                    'bearing'
                  )
                }
                className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer transition-colors text-neutral-900 group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold">Copy bearing</span>
                </div>
                {copiedLabel === 'bearing' ? (
                  <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                    Copied
                  </span>
                ) : (
                  <span className="text-neutral-600 font-normal text-[9px]">
                    {String(bearing).padStart(3, '0')}° {cardinal}
                  </span>
                )}
              </button>
            )}

            {/* Ground Option 5: Send to Dispatch Desk */}
            <button
              type="button"
              onClick={() => {
                const cmdName = selectedUnit?.commander
                  ? `@${selectedUnit.commander.split(' ').pop()}, `
                  : '';
                const bearingSnippet = bearing !== null && cardinal
                  ? `on bearing ${String(bearing).padStart(3, '0')}° (${cardinal}) to `
                  : 'to ';
                const dispatchText = `${cmdName}advance ${bearingSnippet}${coordStr}`;
                onInsertToDispatch?.(dispatchText);
                setCopiedLabel('dispatch');
                try {
                  sounds.playDispatchStamp();
                } catch {}
                setTimeout(() => onClose(), 350);
              }}
              className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-blue-50 text-left cursor-pointer transition-colors text-neutral-900"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#1e3a8a]">To dispatch desk</span>
              </div>
              {copiedLabel === 'dispatch' && (
                <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                  Inserted
                </span>
              )}
            </button>

            {/* Infantry Tactical Fire Missions & Forward Observer (FO) Link */}
            {selectedUnit && (selectedUnit.type === 'infantry' || selectedUnit.type === 'guard') && (
              <>
                {/* Option 5b: Request Artillery CFF (Forward Observer Mission) */}
                <button
                  type="button"
                  onClick={() => {
                    const cmdName = selectedUnit.commander
                      ? `@${selectedUnit.commander.split(' ').pop()}, `
                      : '';
                    const dispatchText = `${cmdName}call for fire on ${coordStr} using artillery`;
                    onInsertToDispatch?.(dispatchText);
                    setCopiedLabel('cff_fo');
                    try { sounds.playDispatchStamp(); } catch {}
                    setTimeout(() => onClose(), 350);
                  }}
                  className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-cyan-50 text-left cursor-pointer transition-colors text-neutral-900 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-cyan-900">Request artillery CFF (FO)</span>
                  </div>
                  {copiedLabel === 'cff_fo' && (
                    <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                      Inserted
                    </span>
                  )}
                </button>

                {/* Option 5c: Hold fire for mass volley */}
                <button
                  type="button"
                  onClick={() => {
                    const cmdName = selectedUnit.commander
                      ? `@${selectedUnit.commander.split(' ').pop()}, `
                      : '';
                    const dispatchText = `${cmdName}hold fire for volley`;
                    onInsertToDispatch?.(dispatchText);
                    setCopiedLabel('volley');
                    try { sounds.playDispatchStamp(); } catch {}
                    setTimeout(() => onClose(), 350);
                  }}
                  className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-amber-50 text-left cursor-pointer transition-colors text-neutral-900 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-amber-900">Hold fire for mass volley</span>
                  </div>
                  {copiedLabel === 'volley' && (
                    <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                      Inserted
                    </span>
                  )}
                </button>

                {/* Option 5d: Lay Suppressive Covering Fire */}
                <button
                  type="button"
                  onClick={() => {
                    const cmdName = selectedUnit.commander
                      ? `@${selectedUnit.commander.split(' ').pop()}, `
                      : '';
                    const dispatchText = `${cmdName}lay suppressive fire on ${coordStr}`;
                    onInsertToDispatch?.(dispatchText);
                    setCopiedLabel('suppress');
                    try { sounds.playDispatchStamp(); } catch {}
                    setTimeout(() => onClose(), 350);
                  }}
                  className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-orange-50 text-left cursor-pointer transition-colors text-neutral-900 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-orange-900">Lay suppressive fire</span>
                  </div>
                  {copiedLabel === 'suppress' && (
                    <span className="text-emerald-700 font-bold text-[9px] flex items-center gap-0.5">
                      Inserted
                    </span>
                  )}
                </button>
              </>
            )}

            {/* Ground Option 6: Pinpoint Target for Fire / Assault */}
            {onPinpointTarget && (
              <button
                type="button"
                onClick={() => {
                  onPinpointTarget(worldCoords);
                  onClose();
                }}
                className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-red-50 text-left cursor-pointer transition-colors text-neutral-900"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-red-900">Pinpoint target</span>
                </div>
              </button>
            )}
          </>
        )}
      </div>

      <div className="px-2.5 py-1 bg-neutral-100 border-t border-neutral-200 text-[8px] font-mono text-neutral-500 flex items-center justify-between">
        <span>Drag TRP: Reposition</span>
        <span>X / Shift+Click: Copy</span>
      </div>
    </div>
  );
};
