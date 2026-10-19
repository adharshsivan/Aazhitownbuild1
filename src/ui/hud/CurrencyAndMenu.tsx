/**
 * Lokam Mini — Currency Counter & Quick Menu Button (Top-Right HUD)
 * Translucent smoked acrylic glass pill and circular button with fine specular rims.
 */

import React from 'react';
import { Menu } from 'lucide-react';

interface CurrencyAndMenuProps {
  coins?: number;
  onOpenMenu: () => void;
}

export const CurrencyAndMenu: React.FC<CurrencyAndMenuProps> = ({
  coins = 320,
  onOpenMenu,
}) => {
  return (
    <div className="flex items-center space-x-2.5 select-none pointer-events-auto">
      {/* 1. Translucent Smoked Glass Coin Pill */}
      <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-950/45 hover:bg-slate-950/55 backdrop-blur-xl border border-white/30 shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-white transition-colors">
        {/* Embossed Golden Coin Icon */}
        <div className="w-5.5 h-5.5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 p-[1px] shadow-[0_2px_6px_rgba(245,158,11,0.5)] flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-gradient-to-b from-amber-400 to-amber-500 border border-amber-300 flex items-center justify-center text-amber-950 font-black text-[11px] leading-none drop-shadow-sm">
            ★
          </div>
        </div>

        {/* Currency Amount */}
        <span className="font-bold text-sm text-white tracking-wide font-sans drop-shadow-sm">
          {coins}
        </span>
      </div>

      {/* 2. Translucent Smoked Glass Circular Menu Button */}
      <button
        onClick={onOpenMenu}
        aria-label="Open Quick Menu"
        className="w-10.5 h-10.5 rounded-full bg-slate-950/45 hover:bg-slate-950/60 active:scale-90 backdrop-blur-xl border border-white/30 shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-white flex items-center justify-center transition-all focus:outline-none cursor-pointer"
      >
        <Menu className="w-5 h-5 stroke-[2.2] drop-shadow-sm" />
      </button>
    </div>
  );
};
