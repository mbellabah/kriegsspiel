import React, { useState } from 'react';
import { CombatLogEntry, Vector2D } from '../types/game';
import { toGridRef } from '../engine/grid';
import { GlyphClose } from './glyphs';

interface CombatDispatchesProps {
  logs: CombatLogEntry[];
  isOpen: boolean;
  onClose: () => void;
  onFocusLocation?: (loc: Vector2D) => void;
  embedded?: boolean;
}

// "07:05 AM" / "01:30 PM" -> "0705" / "1330"
const toMilitaryTime = (t: string) => {
  const m = t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}${m[2]}`;
};

export const CombatDispatches: React.FC<CombatDispatchesProps> = ({ logs, isOpen, onClose, onFocusLocation, embedded = false }) => {
  const [keyOnly, setKeyOnly] = useState(false);
  if (!isOpen) return null;

  const displayedLogs = logs.filter((l) => !keyOnly || l.importance !== 'normal').slice(0, 60);

  const containerClasses = embedded
    ? 'flex-1 min-h-0 flex flex-col overflow-hidden bg-[#fbfbfa] text-black font-sans select-none'
    : 'absolute bottom-12 left-4 z-40 w-96 max-h-80 bg-[#fbfbfa] border border-[#a1a1aa] text-black font-sans select-none flex flex-col overflow-hidden';

  const ContainerTag = embedded ? 'div' : 'aside';

  return (
    <ContainerTag className={containerClasses}>
      <div className="flex items-center justify-between h-6 px-2 border-b border-[#d4d4d8] text-[10px] text-neutral-600 flex-shrink-0">
        <div className="flex items-center">
          {[
            { v: false, label: 'All' },
            { v: true, label: 'Key events' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setKeyOnly(o.v)}
              className={`px-1.5 h-5 cursor-pointer ${keyOnly === o.v ? 'text-black font-semibold underline underline-offset-2' : 'hover:text-black'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span>{logs.length} entries</span>
          {!embedded && (
            <button onClick={onClose} className="text-neutral-500 hover:text-black p-0.5 hover:bg-[#d4d4d8]" title="Close">
              <GlyphClose size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 custom-scrollbar">
        {displayedLogs.length === 0 ? (
          <p className="text-[11px] text-neutral-500 p-3 text-center">No entries yet.</p>
        ) : (
          displayedLogs.map((log) => {
            const isFrench = log.faction === 'french';
            const canJump = !!log.location && !!onFocusLocation;
            return (
              <button
                key={log.id}
                type="button"
                disabled={!canJump}
                onClick={() => log.location && onFocusLocation?.(log.location)}
                title={canJump ? 'Show on map' : undefined}
                className={`w-full text-left grid grid-cols-[34px_1fr] gap-x-2 px-2 py-1 border-b border-[#e4e4e7] border-l-[3px] ${
                  isFrench ? 'border-l-[#1e3a8a]' : 'border-l-[#b91c1c]'
                } ${canJump ? 'hover:bg-[#f4f4f5] cursor-pointer' : 'cursor-default'}`}
              >
                <span className="font-mono text-[10px] text-neutral-500 pt-px">{toMilitaryTime(log.timeFormatted)}</span>
                <span
                  className={`text-[11px] leading-snug ${
                    log.importance === 'critical' ? 'text-black font-semibold' : log.importance === 'highlight' ? 'text-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  {log.message}
                  {log.location && (
                    <span className="ml-1.5 font-mono text-[9.5px] text-neutral-500 whitespace-nowrap">{toGridRef(log.location)}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </ContainerTag>
  );
};
