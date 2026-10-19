/**
 * Lokam Mini — Quick Menu Modal
 * Clean smoked frosted glass side drawer matching the visual language of RadioStationsModal & GameSettingsModal.
 */

import React from 'react';
import { X, Volume2, VolumeX, Sliders, RotateCcw, Check } from 'lucide-react';
import type { LokamGame } from '../../app/game/LokamGame';
import type { GraphicsPreset } from '../../core/config/GlobalSettings';

interface QuickMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: LokamGame | null;
}

export const QuickMenuModal: React.FC<QuickMenuModalProps> = ({
  isOpen,
  onClose,
  game,
}) => {
  if (!isOpen) return null;

  const settings = game?.services.settings;
  const audioSettings = settings?.audio;
  const currentPreset = settings?.graphics.preset || 'high';

  const handleToggleMute = () => {
    if (!settings || !audioSettings) return;
    settings.updateAudio({ muted: !audioSettings.muted });
  };

  const handleVolumeChange = (val: number) => {
    settings?.updateAudio({ masterVolume: val });
  };

  const handlePresetSelect = (preset: GraphicsPreset) => {
    settings?.setGraphicsPreset(preset);
  };

  const handleRespawn = () => {
    game?.services.eventBus.emit('player:teleported', { position: [0, 0.5, 12] });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-md animate-in fade-in duration-200 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm h-full bg-[#0a0e17]/90 backdrop-blur-2xl border-l border-white/[0.08] p-6 flex flex-col justify-between text-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="font-display text-base font-extrabold tracking-wide text-white">
              Island Menu
            </h2>
            <p className="text-white/50 text-xs font-sans mt-0.5">
              Quick access controls & presets
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer border border-white/[0.05]"
            title="Close"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Content sections */}
        <div className="space-y-6 my-6 flex-1">
          {/* Section 1: Audio Volume */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-white/80">
              <span className="flex items-center gap-2">
                {audioSettings?.muted ? (
                  <VolumeX className="w-4 h-4 text-white/50" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white/70" />
                )}
                Master Audio
              </span>
              <button
                onClick={handleToggleMute}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/70 hover:text-white transition-all cursor-pointer"
              >
                {audioSettings?.muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioSettings?.masterVolume ?? 0.8}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #ffffff ${Math.round(
                  ((audioSettings?.masterVolume ?? 0.8) / 1) * 100
                )}%, rgba(255, 255, 255, 0.12) ${Math.round(
                  ((audioSettings?.masterVolume ?? 0.8) / 1) * 100
                )}%)`,
              }}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-white"
            />
          </div>

          {/* Section 2: Graphics Quality Preset */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-white/80">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-white/70" />
                Graphics Quality
              </span>
              <span className="text-white/50 uppercase font-hud text-[11px]">{currentPreset}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as GraphicsPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePresetSelect(p)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium capitalize flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    currentPreset === p
                      ? 'bg-white text-neutral-950 font-bold shadow-sm'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  {currentPreset === p && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Navigation & Fast Return */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            <button
              onClick={handleRespawn}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.06] flex items-center justify-center space-x-2 text-xs font-medium text-white/80 hover:text-white transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-white/60" />
              <span>Return to Waterfront Pier</span>
            </button>
          </div>
        </div>

        {/* Footer Resume Button */}
        <div className="pt-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-white hover:bg-white/90 text-neutral-950 font-bold text-xs sm:text-sm tracking-wide shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            Resume Exploration
          </button>
        </div>
      </div>
    </div>
  );
};
