import React from 'react';
import { Scenario } from '../types/game';
import { GlyphClose } from './glyphs';

interface HistoricalModalProps {
  scenario: Scenario;
  isOpen: boolean;
  onClose: () => void;
}

export const HistoricalModal: React.FC<HistoricalModalProps> = ({ scenario, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[#fbfbfa] border-2 border-[#71717a] max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-sm text-neutral-900 font-sans">
        {/* Header */}
        <div className="bg-[#e4e4e7] border-b border-[#a1a1aa] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-bold text-sm text-neutral-900 uppercase tracking-wide">
                {scenario.title}
              </h2>
              <p className="text-[11px] text-neutral-600 font-medium">
                {scenario.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-black p-1 hover:bg-[#d4d4d8] transition-colors cursor-pointer"
          >
            <GlyphClose size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans leading-relaxed">
          {/* Situation Overview */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e3a8a] mb-1.5 flex items-center gap-1.5">
              The Strategic Situation
            </h3>
            <p className="text-neutral-800 text-justify bg-white p-3.5 border border-[#d4d4d8] shadow-2xs">
              {scenario.briefing.overview}
            </p>
          </div>

          {/* Opposing Objectives */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-blue-50/80 border border-blue-200 p-3 shadow-2xs">
              <h4 className="text-xs uppercase font-bold text-[#1e3a8a] mb-1 flex items-center gap-1.5">
                French Objective (Napoleon)
              </h4>
              <p className="text-xs text-blue-950 text-justify leading-relaxed">
                {scenario.briefing.frenchObjective}
              </p>
            </div>

            <div className="bg-red-50/80 border border-red-200 p-3 shadow-2xs">
              <h4 className="text-xs uppercase font-bold text-[#b91c1c] mb-1 flex items-center gap-1.5">
                Allied Objective (Alexander & Kutusov)
              </h4>
              <p className="text-xs text-red-950 text-justify leading-relaxed">
                {scenario.briefing.alliedObjective}
              </p>
            </div>
          </div>

          {/* Commander Guide */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e3a8a] mb-1.5 flex items-center gap-1.5">
              War Room Operational Guide
            </h3>
            <ul className="space-y-1.5 text-xs text-neutral-700 bg-white p-3 border border-[#d4d4d8] shadow-2xs">
              <li className="flex items-start gap-2">
                <span className="text-[#1e3a8a] font-bold">•</span>
                <span>
                  <strong>Trace Maneuvers:</strong> Left-click drag from any unit block to draw a curved march or assault vector with animated marching arrows (HistoryMarche style).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1e3a8a] font-bold">•</span>
                <span>
                  <strong>Tactical Formations:</strong> Click a unit to switch between <em>Line</em> (devastating musket volleys), <em>Column</em> (rapid movement & shock bayonet charges), and <em>Square</em> (repels cavalry charges).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1e3a8a] font-bold">•</span>
                <span>
                  <strong>Timeline Scrubbing:</strong> Scrub through the 9 hours of battle (`07:00` to `16:00`) or toggle between the historical documentary script and your own custom sandbox.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1e3a8a] font-bold">•</span>
                <span>
                  <strong>Key Historical Landmarks:</strong> Goldbach Stream & Marshes, Santon Hill, Žuráň Hill (Napoleon HQ), Pratzen Heights plateau, and the frozen Satschan ponds.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#e4e4e7] border-t border-[#a1a1aa] px-5 py-2.5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Enter war room
          </button>
        </div>
      </div>
    </div>
  );
};
