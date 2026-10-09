import React, { useState } from 'react';
import { X } from './glyphs';

interface TroopDoctrineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TroopDoctrineModal: React.FC<TroopDoctrineModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'infantry' | 'cavalry' | 'artillery' | 'hq' | 'symbology'>('infantry');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-[#f5f3ee] border border-[#23324a] shadow-[0_4px_16px_rgba(28,25,23,0.16)] max-w-2xl w-full flex flex-col max-h-[85vh] font-sans text-neutral-900">
        {/* Header */}
        <div className="bg-[#23324a] text-white px-4 py-3 flex items-center justify-between border-b border-[#2e4160]">
          <div className="flex items-center gap-2">
            
            <div>
              <h2 className="text-sm font-semibold ">
                Reference: units, formations and symbols
              </h2>
              <p className="text-[10px] text-blue-200">
                Staff College Guide to Combined Arms, Formations & NATO APP-6 Symbology
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#d9d3c7] bg-[#e8e4db] text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('infantry')}
            className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
 activeTab === 'infantry'
 ? 'border-[#23324a] bg-white text-[#23324a]'
 : 'border-transparent text-neutral-600 hover:text-neutral-900'
 }`}
          >
            
            <span>Infantry [ X ]</span>
          </button>
          <button
            onClick={() => setActiveTab('cavalry')}
            className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
 activeTab === 'cavalry'
 ? 'border-[#23324a] bg-white text-[#23324a]'
 : 'border-transparent text-neutral-600 hover:text-neutral-900'
 }`}
          >
            
            <span>Cavalry [ / ]</span>
          </button>
          <button
            onClick={() => setActiveTab('artillery')}
            className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
 activeTab === 'artillery'
 ? 'border-[#23324a] bg-white text-[#23324a]'
 : 'border-transparent text-neutral-600 hover:text-neutral-900'
 }`}
          >
            
            <span>Artillery [ ART ]</span>
          </button>
          <button
            onClick={() => setActiveTab('hq')}
            className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
 activeTab === 'hq'
 ? 'border-[#23324a] bg-white text-[#23324a]'
 : 'border-transparent text-neutral-600 hover:text-neutral-900'
 }`}
          >
            
            <span>HQ & Supply</span>
          </button>
          <button
            onClick={() => setActiveTab('symbology')}
            className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
 activeTab === 'symbology'
 ? 'border-[#23324a] bg-white text-[#23324a]'
 : 'border-transparent text-neutral-600 hover:text-neutral-900'
 }`}
          >
            <span>NATO Key</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 text-xs space-y-4 leading-relaxed">
          {activeTab === 'infantry' && (
            <div className="space-y-4">
              <div className="bg-white p-3 border border-[#d9d3c7] ">
                <div className="flex items-center gap-2 mb-2 text-[#23324a] font-semibold text-sm">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-0.5 text-xs">[ X ]</span>
                  <span>Infantry divisions & Imperial Guard</span>
                </div>
                <p className="text-neutral-700 mb-2">
                  The backbone of the battle line. Armed with smoothbore flintlock muskets, delivering massed volleys and fixing bayonets for shock assaults.
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#fbfaf7] p-2 border border-[#e8e4db]">
                  <div><strong>Volley Range:</strong> 80m – 120m</div>
                  <div><strong>Shock Factor:</strong> High in Bayonet Assault</div>
                  <div><strong>Imperial Guard:</strong> Unshakeable morale, devastating volley density</div>
                  <div><strong>Holding Ground:</strong> Entrenches into defensive abatis</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-neutral-800 text-[10.5px]">
                  Battle formations & tactical usage
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white p-2.5 border border-[#d9d3c7]">
                    <span className="font-semibold text-[#23324a] block mb-1">LINE (2 Ranks)</span>
                    <p className="text-[10px] text-neutral-600">
                      Maximizes frontage and musketry volume. Ideal for defense and firefights. Vulnerable on flank and rear.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 border border-[#d9d3c7]">
                    <span className="font-semibold text-[#23324a] block mb-1">COLUMN (March)</span>
                    <p className="text-[10px] text-neutral-600">
                      Rapid road velocity (+40% speed) and deep shock mass. Used to advance into position quickly.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 border border-[#d9d3c7]">
                    <span className="font-semibold text-[#23324a] block mb-1">SQUARE (Box)</span>
                    <p className="text-[10px] text-neutral-600">
                      Hollow 4-sided hedgehog with outward bayonets. Repels cavalry shock charges completely. Reduced movement.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cavalry' && (
            <div className="space-y-4">
              <div className="bg-white p-3 border border-[#d9d3c7] ">
                <div className="flex items-center gap-2 mb-2 text-[#23324a] font-semibold text-sm">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-0.5 text-xs">[ / ]</span>
                  <span>Heavy & light cavalry</span>
                </div>
                <p className="text-neutral-700 mb-2">
                  Cuirassiers, Dragoons, and Hussars deployed for decisive shock charges, tactical pursuit, and exploitation.
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#fbfaf7] p-2 border border-[#e8e4db]">
                  <div><strong>Top Speed:</strong> ~3.0 map units/sec (Fastest arm)</div>
                  <div><strong>Shock Impact:</strong> Devastating on Line flank/rear</div>
                  <div><strong>Canister Danger:</strong> Highly vulnerable to artillery</div>
                  <div><strong>Square Danger:</strong> Repelled by Infantry Squares</div>
                </div>
              </div>

              <div className="bg-amber-50 p-3 border border-amber-200 text-[10.5px] text-amber-900">
                <strong>Tactical advice:</strong> Never charge unbroken infantry squares directly. Instead, maneuver around exposed flanks or wait until infantry is pinned down in a firefight before initiating a charge.
              </div>
            </div>
          )}

          {activeTab === 'artillery' && (
            <div className="space-y-4">
              <div className="bg-white p-3 border border-[#d9d3c7] ">
                <div className="flex items-center gap-2 mb-2 text-[#23324a] font-semibold text-sm">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-0.5 text-xs">[ ART ]</span>
                  <span>FIELD ARTILLERY (8-pdr & 12-pdr BATTERIES)</span>
                </div>
                <p className="text-neutral-700 mb-2">
                  Heavy indirect and direct fire batteries capable of breaking enemy concentrations from high elevation.
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#fbfaf7] p-2 border border-[#e8e4db]">
                  <div><strong>Max CFF Range:</strong> 350m (Extreme reach)</div>
                  <div><strong>Canister Defense:</strong> 120m (Automatic close defense)</div>
                  <div><strong>Fire Cadence:</strong> Salvo every ~2.5 real seconds</div>
                  <div><strong>Ammunition:</strong> 110 – 150 heavy shot rounds</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-neutral-800 text-[10.5px]">
                  How to call for fire
                </h4>
                <div className="bg-white p-3 border border-[#d9d3c7] space-y-2 text-[10.5px]">
                  <p>
                    1. <strong>Select an Artillery Battery</strong> (e.g. <em>Senarmont Grande Batterie</em> on Žuráň Hill).
                  </p>
                  <p>
                    2. Click <strong>Call for fire (target on map)</strong> in the unit dossier (or press <strong>B</strong>).
                  </p>
                  <p>
                    3. <strong>Click anywhere on the map</strong> (or right-click an enemy unit). If within range (350m), the battery immediately commences bombardment.
                  </p>
                  <p>
                    4. <strong>Autonomous Advance:</strong> If the target is out of range, the battery automatically limbers up, advances to effective firing distance, deploys, and begins shelling!
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hq' && (
            <div className="space-y-4">
              <div className="bg-white p-3 border border-[#d9d3c7] ">
                <div className="flex items-center gap-2 mb-2 text-[#23324a] font-semibold text-sm">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-0.5 text-xs">[ HQ ]</span>
                  <span>Headquarters & supreme command</span>
                </div>
                <p className="text-neutral-700 mb-2">
                  Supreme Commander staff (Napoleon Bonaparte at Žuráň / Kutusov & Alexander at Krzanowitz).
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#fbfaf7] p-2 border border-[#e8e4db]">
                  <div><strong>Command Radius:</strong> 180m aura</div>
                  <div><strong>Morale Boost:</strong> Prevents nearby units from wavering</div>
                  <div><strong>Dispatch Hub:</strong> Couriers gallop from HQ to subordinate corps</div>
                </div>
              </div>

              <div className="bg-white p-3 border border-[#d9d3c7] ">
                <div className="flex items-center gap-2 mb-2 text-[#23324a] font-semibold text-sm">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-0.5 text-xs">[ LOG ]</span>
                  <span>Supply trains & caissons</span>
                </div>
                <p className="text-neutral-700">
                  Logistics park holding thousands of musket and cannon rounds. Automatically replenishes ammo for friendly units within 150m.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'symbology' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-neutral-800 text-[10.5px]">
                NATO APP-6 standard map symbols
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 bg-white p-2 border border-[#d9d3c7]">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-1 text-xs">[ X ]</span>
                  <div>
                    <strong className="block text-[10.5px]">Infantry</strong>
                    <span className="text-[10px] text-neutral-600">Crossed bandoliers / musketry</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 border border-[#d9d3c7]">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-1 text-xs">[ / ]</span>
                  <div>
                    <strong className="block text-[10.5px]">Cavalry</strong>
                    <span className="text-[10px] text-neutral-600">Diagonal sabre slash / mobility</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 border border-[#d9d3c7]">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-1 text-xs">[ ART ]</span>
                  <div>
                    <strong className="block text-[10.5px]">Artillery</strong>
                    <span className="text-[10px] text-neutral-600">Solid projectile with carriage wheels</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 border border-[#d9d3c7]">
                  <span className="font-sans bg-[#23324a] text-white px-2 py-1 text-xs">[ HQ ]</span>
                  <div>
                    <strong className="block text-[10.5px]">Headquarters</strong>
                    <span className="text-[10px] text-neutral-600">Command standard / pennant</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-3 border border-[#d9d3c7] space-y-1 text-[10.5px]">
                <strong className="block text-neutral-800 mb-1">Echelon designators</strong>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-[#f5f3ee] p-1 border"><strong>XXXX</strong><div className="text-[10.5px]">Field Army</div></div>
                  <div className="bg-[#f5f3ee] p-1 border"><strong>XXX</strong><div className="text-[10.5px]">Army Corps</div></div>
                  <div className="bg-[#f5f3ee] p-1 border"><strong>XX</strong><div className="text-[10.5px]">Division</div></div>
                  <div className="bg-[#f5f3ee] p-1 border"><strong>II [BTY]</strong><div className="text-[10.5px]">Battery</div></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#e8e4db] px-4 py-2.5 flex justify-end border-t border-[#d9d3c7]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#23324a] hover:bg-[#2e4160] text-white font-semibold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
