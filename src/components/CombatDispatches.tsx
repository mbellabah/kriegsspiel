import React from 'react';
import { CombatLogEntry } from '../types/game';
import { X, MessageSquare } from 'lucide-react';

interface CombatDispatchesProps {
  logs: CombatLogEntry[];
  isOpen: boolean;
  onClose: () => void;
}

export const CombatDispatches: React.FC<CombatDispatchesProps> = ({ logs, isOpen, onClose }) => {
  if (!isOpen) return null;

  const displayedLogs = logs.slice(0, 30);

  return (
    <aside className="absolute bottom-12 left-4 z-40 w-96 bg-zinc-950/90 border border-zinc-800/90 backdrop-blur-md rounded-lg shadow-2xl p-3 text-zinc-100 select-none flex flex-col max-h-72">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={13} className="text-blue-400" />
          <h2 className="font-semibold text-xs uppercase tracking-wider text-zinc-100">
            Combat Log & Dispatches
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-mono">{logs.length} events</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div className="overflow-y-auto space-y-1.5 flex-1 pr-1 custom-scrollbar">
        {displayedLogs.length === 0 ? (
          <p className="text-[11px] text-zinc-500 italic p-2">Awaiting combat events...</p>
        ) : (
          displayedLogs.map((log) => {
            const isFrench = log.faction === 'french';
            return (
              <div
                key={log.id}
                className="bg-zinc-900/80 border border-zinc-800/80 p-2 rounded text-xs leading-snug"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold uppercase font-mono ${
                      isFrench ? 'text-blue-400' : 'text-red-400'
                    }`}
                  >
                    {isFrench ? 'Blue Force' : 'Red Force'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">{log.timeFormatted}</span>
                </div>
                <p className="text-xs text-zinc-300 font-sans">{log.message}</p>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
