/**
 * Lokam Mini — Building Interior Entrance Modal (Vice City Style)
 * Triggered when player enters the glowing prismatic entrance corona.
 * Displays landmark atmosphere, historic architecture lore, and interior exploration options.
 */

import React from 'react';
import {
  X,
  Building2,
  Sparkles,
  Camera,
  DoorOpen,
  MapPin,
  Compass,
  ArrowRight,
} from 'lucide-react';
import type { BuildingEntranceConfig } from '../../world/buildings/EntranceIndicator';

interface BuildingEntranceModalProps {
  building: BuildingEntranceConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onExploreInterior?: (building: BuildingEntranceConfig) => void;
  onPhotoMode?: () => void;
}

export const BuildingEntranceModal: React.FC<BuildingEntranceModalProps> = ({
  building,
  isOpen,
  onClose,
  onExploreInterior,
  onPhotoMode,
}) => {
  if (!isOpen || !building) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Outer Prismatic Glowing Wrapper (Matching Ride Button & Joystick Chromatic Glow) */}
      <div
        className="relative p-[2px] rounded-3xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.85),0_0_24px_rgba(244,114,182,0.35),0_0_36px_rgba(168,85,247,0.3)] max-w-lg w-full animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Continuous Live Prismatic Chromatic Conic Ring */}
        <div className="absolute -inset-[200%] glimmer-border-glow pointer-events-none" />

        {/* Inner Smoked Frosted Glass Body */}
        <div className="relative z-10 rounded-3xl bg-[#090d16]/90 backdrop-blur-2xl p-5 sm:p-6 text-white border border-white/10">
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shadow-inner flex-shrink-0">
                <Building2 className="w-6 h-6 text-amber-300 stroke-[2]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.08] text-white/70">
                    {building.category}
                  </span>
                  <span className="flex items-center space-x-1 text-[10px] text-emerald-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Open Now</span>
                  </span>
                </div>
                <h2 className="font-display font-extrabold text-lg sm:text-xl text-white tracking-wide mt-1">
                  {building.name}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close building modal"
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            >
              <X className="w-4.5 h-4.5 stroke-[2.2]" />
            </button>
          </div>

          {/* Body Content */}
          <div className="py-4 space-y-3.5">
            <p className="text-white/80 text-xs sm:text-sm leading-relaxed font-sans">
              {building.subtitle || 'Step inside to explore this iconic Fort Kochi coastal destination.'}
            </p>

            {building.interiorStory && (
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/60 leading-relaxed font-sans">
                {building.interiorStory}
              </div>
            )}

            <div className="flex items-center space-x-2 text-xs text-white/40 pt-1">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              <span>Fort Kochi Waterfront Heritage District</span>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={() => {
                onExploreInterior?.(building);
                onClose();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-white text-neutral-950 hover:bg-neutral-200 active:scale-95 text-xs sm:text-sm font-bold shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <DoorOpen className="w-4 h-4 stroke-[2.2]" />
              <span>Enter Building</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>

            <button
              type="button"
              onClick={() => {
                onPhotoMode?.();
                onClose();
              }}
              title="Photograph this landmark"
              className="py-3 px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 text-white text-xs font-semibold border border-white/10 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Photo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
