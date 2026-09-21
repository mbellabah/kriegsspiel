import React from 'react';
import { Scenario } from '../types/game';
import { X, BookOpen, Target, MapPin, Award } from 'lucide-react';

interface HistoricalModalProps {
  scenario: Scenario;
  isOpen: boolean;
  onClose: () => void;
}

export const HistoricalModal: React.FC<HistoricalModalProps> = ({ scenario, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1c1815] border-2 border-[#856c4d] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl text-[#e6d8be]">
        {/* Header */}
        <div className="bg-[#2a2016] border-b border-[#5a4632] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/60 border border-amber-500/60 flex items-center justify-center text-amber-300">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="font-serif font-bold text-lg text-amber-100 uppercase tracking-wide">
                {scenario.title}
              </h2>
              <p className="text-xs text-amber-300/80 font-serif italic">
                {scenario.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-amber-400/80 hover:text-amber-100 p-1.5 rounded-lg hover:bg-[#3d2f21] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 text-sm font-serif leading-relaxed">
          {/* Situation Overview */}
          <div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-amber-400 font-bold mb-2 flex items-center gap-1.5">
              <MapPin size={14} /> The Strategic Situation
            </h3>
            <p className="text-[#d8c8ae] text-justify bg-[#231b13] p-3 rounded-lg border border-[#443322]">
              {scenario.briefing.overview}
            </p>
          </div>

          {/* Opposing Objectives */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-950/30 border border-blue-800/40 p-3.5 rounded-xl">
              <h4 className="text-xs font-serif uppercase font-bold text-blue-300 mb-1.5 flex items-center gap-1.5">
                <Target size={14} /> French Objective (Napoleon)
              </h4>
              <p className="text-xs text-blue-100/90 text-justify">
                {scenario.briefing.frenchObjective}
              </p>
            </div>

            <div className="bg-green-950/30 border border-green-800/40 p-3.5 rounded-xl">
              <h4 className="text-xs font-serif uppercase font-bold text-green-300 mb-1.5 flex items-center gap-1.5">
                <Target size={14} /> Allied Objective (Alexander & Kutusov)
              </h4>
              <p className="text-xs text-green-100/90 text-justify">
                {scenario.briefing.alliedObjective}
              </p>
            </div>
          </div>

          {/* Commander Guide */}
          <div>
            <h3 className="text-xs font-serif uppercase tracking-widest text-amber-400 font-bold mb-2 flex items-center gap-1.5">
              <Award size={14} /> War Room Operational Guide
            </h3>
            <ul className="space-y-2 text-xs text-[#cfbf9f]">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>
                  <strong>Trace Maneuvers:</strong> Left-click drag from any unit block to draw a curved march or assault vector with animated marching arrows (HistoryMarche style).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>
                  <strong>Tactical Formations:</strong> Click a unit to switch between <em>Line</em> (devastating musket volleys), <em>Column</em> (rapid movement & shock bayonet charges), and <em>Square</em> (repels cavalry charges).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>
                  <strong>Timeline Scrubbing:</strong> Scrub through the 9 hours of battle (`07:00` to `16:00`) or toggle between the historical documentary script and your own custom sandbox.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>
                  <strong>Key Historical Landmarks:</strong> Goldbach Stream & Marshes, Santon Hill, Žuráň Hill (Napoleon HQ), Pratzen Heights plateau, and the frozen Satschan ponds.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#241a12] border-t border-[#5a4632] px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-serif font-bold text-xs rounded-lg transition-colors shadow-lg"
          >
            Enter War Room
          </button>
        </div>
      </div>
    </div>
  );
};
