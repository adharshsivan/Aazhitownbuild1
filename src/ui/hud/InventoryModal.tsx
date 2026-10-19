/**
 * Lokam Mini — Backpack & Inventory Modal
 * Smoked frosted acrylic glass modal matching the exact visual language of GameSettingsModal.
 * Displays Fort Kochi inventory items: Roadster bike key, fishing rod, Malabar spices, film rolls, and coconut water.
 */

import React, { useState } from 'react';
import {
  X,
  Package,
  Key,
  Camera,
  Coffee,
  Coins,
  Sparkles,
  Check,
  ChevronRight,
  Info,
} from 'lucide-react';
import { GiFishingHook } from 'react-icons/gi';
import { FaBagShopping } from 'react-icons/fa6';

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Key Item' | 'Gear' | 'Collectible' | 'Consumable';
  rarity: 'Common' | 'Rare' | 'Legendary';
  description: string;
  icon: React.ReactNode;
  count?: number;
  usable?: boolean;
}

const INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: 'roadster_key',
    name: 'Roadster Bicycle Key',
    category: 'Key Item',
    rarity: 'Legendary',
    description: 'Unlocks the classic vintage Kerala black roadster bicycle parked along Fort Kochi promenade.',
    icon: <Key className="w-6 h-6 text-amber-400 stroke-[2]" />,
    usable: true,
  },
  {
    id: 'fishing_rod',
    name: 'Chinese Net Fishing Rod',
    category: 'Gear',
    rarity: 'Rare',
    description: 'Artisanal coastal fishing rod crafted from bamboo and brass, inspired by the Cheena Vala fishing nets.',
    icon: <GiFishingHook className="w-6 h-6 text-cyan-400" />,
    usable: true,
  },
  {
    id: 'malabar_spices',
    name: 'Malabar Spices Pouch',
    category: 'Collectible',
    rarity: 'Rare',
    description: 'A fragrant burlap pouch filled with hand-picked Tellicherry black pepper, green cardamom, and cinnamon.',
    count: 14,
    icon: <Package className="w-6 h-6 text-emerald-400 stroke-[2]" />,
    usable: false,
  },
  {
    id: 'film_roll',
    name: 'Vintage 35mm Film Roll',
    category: 'Collectible',
    rarity: 'Common',
    description: 'High-contrast warm monochrome and kodachrome 36-exposure film for Photo Mode snapshots.',
    count: 8,
    icon: <Camera className="w-6 h-6 text-rose-400 stroke-[2]" />,
    usable: true,
  },
  {
    id: 'tender_coconut',
    name: 'Elaneer (Tender Coconut)',
    category: 'Consumable',
    rarity: 'Common',
    description: 'Freshly harvested sweet tender coconut water. Instantly restores full stamina and refresh rate.',
    count: 3,
    icon: <Coffee className="w-6 h-6 text-lime-400 stroke-[2]" />,
    usable: true,
  },
  {
    id: 'gold_coins',
    name: 'Travancore Gold Coins',
    category: 'Collectible',
    rarity: 'Rare',
    description: 'Antique maritime trade coins accepted at local bazaar stalls, tea stalls, and ferry wharfs.',
    count: 320,
    icon: <Coins className="w-6 h-6 text-yellow-300 stroke-[2]" />,
    usable: false,
  },
];

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseItem?: (item: InventoryItem) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  onUseItem,
}) => {
  const [selectedItem, setSelectedItem] = useState<InventoryItem>(INVENTORY_ITEMS[0]);
  const [usedFeedback, setUsedFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUse = (item: InventoryItem) => {
    onUseItem?.(item);
    setUsedFeedback(`Equipped ${item.name}!`);
    setTimeout(() => {
      setUsedFeedback(null);
    }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-neutral-950/90 border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
              <FaBagShopping className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-wide">
                Island Backpack
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                Gear, collectables & waterfront equipment
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close inventory"
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>
        </div>

        {/* Content Body: Left Items Grid + Right Details Panel */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-12 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          {/* Left Grid: 7 Cols */}
          <div className="sm:col-span-7 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-white/50 px-1 font-medium">
              <span>Carried Items ({INVENTORY_ITEMS.length}/12)</span>
              <span className="text-amber-300 font-mono">320 Coins</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {INVENTORY_ITEMS.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center p-2.5 border transition-all cursor-pointer text-center group ${
                      isSelected
                        ? 'border-amber-400/80 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.2)] scale-[1.02]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    <div className="mb-1.5 transition-transform group-hover:scale-110">
                      {item.icon}
                    </div>
                    <span className="text-[11px] font-semibold text-white/90 line-clamp-1 leading-tight">
                      {item.name}
                    </span>
                    {item.count && (
                      <span className="absolute bottom-1.5 right-2 text-[10px] font-mono text-white/50">
                        x{item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Inspector: 5 Cols */}
          <div className="sm:col-span-5 p-4 sm:p-5 flex flex-col justify-between bg-white/[0.015]">
            {selectedItem ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mb-2.5">
                    {selectedItem.icon}
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    {selectedItem.name}
                  </h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/[0.06] text-white/60">
                      {selectedItem.category}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      selectedItem.rarity === 'Legendary'
                        ? 'bg-amber-400/20 text-amber-300'
                        : selectedItem.rarity === 'Rare'
                        ? 'bg-cyan-400/20 text-cyan-300'
                        : 'bg-white/10 text-white/70'
                    }`}>
                      {selectedItem.rarity}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-xs text-white/70 leading-relaxed font-sans">
                    {selectedItem.description}
                  </p>
                </div>

                {usedFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center space-x-2 animate-in fade-in">
                    <Check className="w-4 h-4" />
                    <span>{usedFeedback}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/40 text-xs">
                Select an item to inspect
              </div>
            )}

            {selectedItem && (
              <div className="pt-4">
                <button
                  type="button"
                  disabled={!selectedItem.usable}
                  onClick={() => handleUse(selectedItem)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                    selectedItem.usable
                      ? 'bg-white text-neutral-950 hover:bg-neutral-200 active:scale-95 cursor-pointer shadow-lg'
                      : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{selectedItem.usable ? 'Use / Equip Item' : 'Passive Collectable'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
