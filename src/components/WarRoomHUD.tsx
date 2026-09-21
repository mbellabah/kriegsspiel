import React from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { Play, Pause, RotateCcw, Users, MessageSquare, Eye, Shield } from 'lucide-react';
import { REALISTIC_AUSTERLITZ_SCENARIO } from '../data/austerlitzScenario';
import { sounds } from '../engine/soundEffects';

interface WarRoomHUDProps {
  engine: BattleEngine;
  state: SimulationState;
  showHexGrid: boolean;
  onToggleHexGrid: () => void;
  symbology: 'tactical' | 'nato';
  onToggleSymbology: () => void;
  isCinematicMode: boolean;
  onToggleCinematic: () => void;
  isOOBOpen: boolean;
  onToggleOOB: () => void;
  isDispatchesOpen: boolean;
  onToggleDispatches: () => void;
}

export const WarRoomHUD: React.FC<WarRoomHUDProps> = ({
  engine,
  state,
  showHexGrid,
  onToggleHexGrid,
  symbology,
  onToggleSymbology,
  isCinematicMode,
  onToggleCinematic,
  isOOBOpen,
  onToggleOOB,
  isDispatchesOpen,
  onToggleDispatches,
}) => {
  const currentFormattedTime = engine.formatTime(state.timeMinutes);
  const totalDuration = REALISTIC_AUSTERLITZ_SCENARIO.endTimeMinutes - REALISTIC_AUSTERLITZ_SCENARIO.initialTimeMinutes;

  const handleTogglePlay = () => {
    const willRun = !state.isRunning;
    engine.setRunning(willRun);
    if (willRun) {
      sounds.playDrum();
    }
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    engine.scrubToTime(val);
  };

  if (isCinematicMode) {
    return (
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 font-sans">
        <button
          onClick={onToggleCinematic}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#d4d4d8] border border-[#a1a1aa] text-black text-xs shadow-sm hover:bg-[#e4e4e7]"
          title="Exit Broadcast Mode (Hotkey: C)"
        >
          <Eye size={13} />
          <span>SHOW UI (C)</span>
        </button>
      </div>
    );
  }

  return (
    <header className="absolute top-0 left-0 right-0 z-40 h-10 bg-[#e4e4e7] border-b-2 border-[#a1a1aa] px-2 flex items-center justify-between text-black select-none font-sans shadow-sm font-semibold">
      {/* Left: System ID */}
      <div className="flex items-center gap-4 min-w-[250px]">
        <div className="px-2 py-0.5 bg-[#1e3a8a] text-white border border-[#1e40af] text-[10px] tracking-wider uppercase flex items-center gap-2 shadow-inner">
          <Shield size={12} />
          <span>JCATS SIMULATION ENV</span>
        </div>
        <div className="text-xs uppercase tracking-tight text-neutral-700">
          OP AUSTERLITZ
        </div>
      </div>

      {/* Center: Controls & Time */}
      <div className="flex-1 flex items-center justify-center gap-6">
        <div className="flex items-center gap-1 bg-[#d4d4d8] border border-[#a1a1aa] p-0.5 shadow-inner">
          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] uppercase font-bold border transition-colors ${
              state.isRunning
                ? 'bg-[#dc2626] border-[#b91c1c] text-white shadow-inner'
                : 'bg-[#f4f4f5] border-[#d4d4d8] text-neutral-800 hover:bg-white'
            }`}
          >
            {state.isRunning ? <Pause size={12} /> : <Play size={12} />}
            <span>{state.isRunning ? 'PAUSED' : 'RUN'}</span>
          </button>

          <div className="w-px h-5 bg-[#a1a1aa] mx-1" />

          {[1, 2, 5, 10].map((speed) => (
            <button
              key={speed}
              onClick={() => engine.setSpeedMultiplier(speed)}
              className={`px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors ${
                state.speedMultiplier === speed
                  ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                  : 'bg-[#f4f4f5] border-[#d4d4d8] text-neutral-600 hover:bg-white'
              }`}
            >
              {speed}X
            </button>
          ))}

          <button
            onClick={() => engine.resetBattle()}
            className="p-1 text-neutral-600 hover:text-black ml-1"
            title="Reset Simulation"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        {/* Time & Track */}
        <div className="flex items-center gap-3 flex-1 max-w-[400px]">
          <div className="font-mono text-xs font-bold text-black bg-[#f4f4f5] border border-[#a1a1aa] px-2 py-1 shadow-inner min-w-[70px] text-center">
            {currentFormattedTime}
          </div>
          <div className="relative flex-1 flex items-center h-4">
            <input
              type="range"
              min="0"
              max={totalDuration}
              value={state.timeMinutes}
              onChange={handleTimelineScrub}
              className="w-full h-1 bg-[#a1a1aa] appearance-none cursor-pointer accent-[#1e3a8a] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Right: Metrics & Toggles */}
      <div className="flex items-center gap-2 min-w-[350px] justify-end">
        {/* CASUALTY BOX */}
        <div className="flex items-center gap-3 text-[10px] font-mono bg-[#f4f4f5] px-2 py-1 border border-[#a1a1aa] shadow-inner font-bold uppercase tracking-tight">
          <div className="flex items-center gap-1 text-[#1d4ed8]">
            <span>BLUFOR:</span>
            <span>{Math.floor(state.frenchLosses).toLocaleString()}</span>
          </div>
          <div className="w-px h-3 bg-[#a1a1aa]" />
          <div className="flex items-center gap-1 text-[#b91c1c]">
            <span>REDFOR:</span>
            <span>{Math.floor(state.alliedLosses).toLocaleString()}</span>
          </div>
        </div>

        <div className="w-px h-5 bg-[#a1a1aa]" />

        {/* System Toggles */}
        <button
          onClick={onToggleSymbology}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase font-bold border ${
            symbology === 'nato' ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#f4f4f5] text-neutral-700 border-[#a1a1aa] hover:bg-white'
          }`}
        >
          <span>NATO 2525</span>
        </button>

        <button
          onClick={onToggleHexGrid}
          className={`px-2 py-1 text-[10px] uppercase font-bold border ${
            showHexGrid ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#f4f4f5] text-neutral-700 border-[#a1a1aa] hover:bg-white'
          }`}
        >
          GRID
        </button>

        <button
          onClick={onToggleOOB}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase font-bold border ${
            isOOBOpen ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#f4f4f5] text-neutral-700 border-[#a1a1aa] hover:bg-white'
          }`}
        >
          <Users size={12} /> ORBAT
        </button>

        <button
          onClick={onToggleDispatches}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase font-bold border ${
            isDispatchesOpen ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#f4f4f5] text-neutral-700 border-[#a1a1aa] hover:bg-white'
          }`}
        >
          <MessageSquare size={12} /> LOG
        </button>
      </div>
    </header>
  );
};

