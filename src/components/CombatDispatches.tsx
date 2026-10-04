import React from 'react';
import { CombatLogEntry } from '../types/game';
import { X, MessageSquare } from 'lucide-react';

interface CombatDispatchesProps {
  logs: CombatLogEntry[];
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export const CombatDispatches: React.FC<CombatDispatchesProps> = ({ logs, isOpen, onClose, embedded = false }) => {
  if (!isOpen) return null;

  const displayedLogs = logs.slice(0, 50);

  const containerClasses = embedded
    ? "flex-1 min-h-0 flex flex-col overflow-hidden bg-[#f4f4f5] text-black font-sans select-none"
    : "absolute bottom-12 left-4 z-40 w-96 max-h-80 bg-[#f4f4f5] border-2 border-[#a1a1aa] shadow-2xl rounded text-black font-sans select-none flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-150";

  const ContainerTag = embedded ? 'div' : 'aside';

  return (
    <ContainerTag className={containerClasses}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#a1a1aa] bg-[#e4e4e7]">
          <div className="flex items-center gap-1.5">
            <MessageSquare size={13} className="text-[#1e3a8a]" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-black">
              Combat Log & Dispatches
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-600 font-mono">{logs.length} events</span>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-black p-1 rounded hover:bg-[#d4d4d8] transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Subheader info if embedded */}
      {embedded && (
        <div className="px-3 py-1 bg-[#e4e4e7] border-b border-[#a1a1aa] flex items-center justify-between text-[10px] font-mono text-neutral-600">
          <span>HISTORICAL DISPATCH FEED</span>
          <span>{logs.length} EVENTS RECORDED</span>
        </div>
      )}

      {/* Log Feed */}
      <div className="overflow-y-auto p-2 space-y-1.5 flex-1 pr-1.5">
        {displayedLogs.length === 0 ? (
          <p className="text-[11px] text-neutral-500 italic p-3 text-center">Awaiting tactical combat events...</p>
        ) : (
          displayedLogs.map((log) => {
            const isFrench = log.faction === 'french';
            return (
              <div
                key={log.id}
                className="bg-white border border-[#a1a1aa] p-2 rounded shadow-2xs text-xs leading-snug"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold uppercase font-mono ${
                      isFrench ? 'text-[#1d4ed8]' : 'text-[#b91c1c]'
                    }`}
                  >
                    {isFrench ? 'BLUFOR (FRA)' : 'REDFOR (ALL)'}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500 font-semibold">{log.timeFormatted}</span>
                </div>
                <p className="text-[11px] text-neutral-800 font-sans">{log.message}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 bg-[#e4e4e7] border-t border-[#a1a1aa] text-[9px] text-neutral-600 text-center font-semibold">
        Chronological Signal & Engagement Ledger
      </div>
    </ContainerTag>
  );
};
