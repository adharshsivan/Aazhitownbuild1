/**
 * Lokam Mini — Game Settings Modal
 * Clean smoked frosted glass aesthetic perfectly aligned with RadioStationsModal.
 * Features left tab navigation (General, Visual, Audio, Controls), sectioned cards,
 * and standard white / frosted glass controls.
 */

import React, { useState } from 'react';
import {
  X,
  Volume2,
  Tv,
  Gamepad2,
  SlidersHorizontal,
  Globe,
  Subtitles,
  Monitor,
  Music,
  AudioLines,
  Layers,
  Sparkles,
  Mountain,
  Users,
  RotateCcw,
  Check,
  HelpCircle,
  LifeBuoy,
  Bug,
  ShieldCheck,
  Send,
} from 'lucide-react';
import type { LokamGame } from '../../app/game/LokamGame';

interface GameSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: LokamGame | null;
}

type TabKey = 'general' | 'visual' | 'audio' | 'controls' | 'support';

interface LanguageOption {
  id: string;
  name: string;
  script: string;
}

const LANGUAGES: LanguageOption[] = [
  { id: 'English', name: 'English', script: 'EN' },
  { id: 'Malayalam', name: 'Malayalam', script: 'മല' },
  { id: 'Tamil', name: 'Tamil', script: 'தமி' },
  { id: 'Telugu', name: 'Telugu', script: 'తెలు' },
  { id: 'Kannada', name: 'Kannada', script: 'ಕನ್ನ' },
];

export const GameSettingsModal: React.FC<GameSettingsModalProps> = ({
  isOpen,
  onClose,
  game,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  // General state
  const [language, setLanguage] = useState('English');
  const [subtitles, setSubtitles] = useState(true);
  const [fullscreen, setFullscreen] = useState(true);

  // Audio state
  const [masterVolume, setMasterVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(60);
  const [sfxVolume, setSfxVolume] = useState(70);

  // Visual state
  const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('high');
  const [antiAliasing, setAntiAliasing] = useState(true);
  const [bloom, setBloom] = useState(true);
  const [drawDistance, setDrawDistance] = useState('High');
  const [trafficDensity, setTrafficDensity] = useState('Medium');

  // Controls state
  const [sensitivity, setSensitivity] = useState(65);
  const [invertY, setInvertY] = useState(false);
  const [vibration, setVibration] = useState(true);

  // Support state
  const [feedbackType, setFeedbackType] = useState<'bug' | 'suggestion' | 'help'>('bug');
  const [feedbackText, setFeedbackText] = useState('');
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  if (!isOpen) return null;

  const toggleFullscreen = () => {
    const next = !fullscreen;
    setFullscreen(next);
    try {
      if (next) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } catch {
      // Ignore if iframe restrictions apply
    }
  };

  const handleReset = () => {
    setLanguage('English');
    setSubtitles(true);
    setFullscreen(true);
    setMasterVolume(80);
    setMusicVolume(60);
    setSfxVolume(70);
    setQualityPreset('high');
    setAntiAliasing(true);
    setBloom(true);
    setDrawDistance('High');
    setTrafficDensity('Medium');
    setSensitivity(65);
    setInvertY(false);
    setVibration(true);
  };

  const handleApply = () => {
    // Apply audio settings to game service
    game?.services.settings.updateAudio({
      masterVolume: masterVolume / 100,
      musicVolume: musicVolume / 100,
      sfxVolume: sfxVolume / 100,
    });
    // Apply graphics settings
    game?.services.settings.setGraphicsPreset(qualityPreset);
    game?.services.settings.updateGraphics({
      antialias: antiAliasing,
      postProcessing: bloom,
      viewDistance: drawDistance === 'Low' ? 150 : drawDistance === 'Medium' ? 300 : drawDistance === 'High' ? 500 : 800,
      vegetationDensity: trafficDensity === 'Low' ? 'low' : trafficDensity === 'Medium' ? 'medium' : 'high',
    });
    // Apply controls settings
    game?.services.settings.updateControls({
      mouseSensitivity: sensitivity / 50,
      touchSensitivity: sensitivity / 50,
      invertY,
      hapticFeedback: vibration,
    });
    onClose();
  };

  // Helper Standard Toggle Switch Component (Consistent with clean white/glass theme - Large Mobile Touch)
  const ToggleSwitch = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label?: string;
  }) => (
    <div className="flex items-center space-x-2.5 flex-shrink-0">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? 'bg-white shadow-sm' : 'bg-white/[0.12] border border-white/[0.08]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full shadow transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5 bg-neutral-950' : 'translate-x-0 bg-white/60'
          }`}
        />
      </button>
      <span className="text-xs sm:text-sm font-medium text-white/50 min-w-[24px] pointer-events-none">
        {checked ? 'On' : 'Off'}
      </span>
    </div>
  );

  // Helper Filled Slider Component with dynamic white fill track
  const FilledSlider = ({
    min = 0,
    max = 100,
    step = 1,
    value,
    onChange,
    ariaLabel,
  }: {
    min?: number;
    max?: number;
    step?: number;
    value: number;
    onChange: (val: number) => void;
    ariaLabel?: string;
  }) => {
    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    return (
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, #ffffff ${percentage}%, rgba(255, 255, 255, 0.12) ${percentage}%)`,
        }}
        className="w-full h-2 sm:h-2.5 rounded-full appearance-none cursor-pointer accent-white"
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md transition-all duration-300 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── MAIN MODAL WINDOW CONTAINER (Clean Transparent Smoked Frosted Glass - FIXED SIZE) ── */}
      <div className="relative w-[880px] max-w-[96vw] h-[640px] sm:h-[660px] max-h-[94vh] flex flex-col rounded-[26px] sm:rounded-3xl bg-[#0a0e17]/85 backdrop-blur-2xl border border-white/[0.08] shadow-[0_30px_70px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Subtle Ambient Highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        {/* ── MODAL HEADER ── */}
        <div className="relative z-10 px-5 sm:px-7 pt-5 sm:pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/[0.08] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] flex-shrink-0">
              <SlidersHorizontal className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[2] text-white" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-2xl font-extrabold tracking-wide text-white drop-shadow-sm leading-tight">
                Settings
              </h2>
              <p className="text-white/50 text-xs sm:text-sm font-sans mt-0.5">
                Graphics, audio levels, gameplay controls and display preferences
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.14] active:scale-90 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* ── MAIN BODY (SPLIT VIEW: CATEGORY SIDEBAR + SETTINGS CARDS) ── */}
        <div className="relative z-10 px-5 sm:px-7 py-4 flex-1 min-h-0 flex flex-col sm:flex-row gap-4 sm:gap-5 overflow-hidden">
          {/* Left Category Sidebar (Clean Transparent Glass) */}
          <div className="w-full sm:w-48 flex-shrink-0 flex sm:flex-col overflow-x-auto sm:overflow-x-visible space-x-1.5 sm:space-x-0 sm:space-y-1.5 pb-1 sm:pb-0 scrollbar-none">
            {/* 1. General */}
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                activeTab === 'general'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <SlidersHorizontal className="w-4.5 h-4.5 text-white/70" />
                <span>General</span>
              </div>
            </button>

            {/* 2. Visual */}
            <button
              onClick={() => setActiveTab('visual')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                activeTab === 'visual'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Tv className="w-4.5 h-4.5 text-white/70" />
                <span>Visual</span>
              </div>
            </button>

            {/* 3. Audio */}
            <button
              onClick={() => setActiveTab('audio')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                activeTab === 'audio'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Volume2 className="w-4.5 h-4.5 text-white/70" />
                <span>Audio</span>
              </div>
            </button>

            {/* 4. Controls */}
            <button
              onClick={() => setActiveTab('controls')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                activeTab === 'controls'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Gamepad2 className="w-4.5 h-4.5 text-white/70" />
                <span>Controls</span>
              </div>
            </button>

            {/* 5. Support */}
            <button
              onClick={() => setActiveTab('support')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                activeTab === 'support'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <HelpCircle className="w-4.5 h-4.5 text-white/70" />
                <span>Support</span>
              </div>
            </button>
          </div>

          {/* Right Content Pane (Scrollable Cards Container) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-1.5 glass-scrollbar">
            {/* ── 1. GENERAL TAB ── */}
            {activeTab === 'general' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                      Display & Interface
                    </h3>
                    <p className="text-white/40 text-[11px] sm:text-xs mt-0.5">
                      Language localization and screen display settings
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Language Option Picker (Original script 2 characters: EN, മല, தமி, हिं, తెలు, ಕನ್ನ) */}
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] sm:col-span-2 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <Globe className="w-4 h-4 text-white/60" />
                          <span className="text-xs font-medium text-white/80">Language</span>
                        </div>
                        <span className="text-[11px] text-white/50 font-medium">
                          {LANGUAGES.find((l) => l.id === language)?.name || language}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {LANGUAGES.map((lang) => {
                          const isSelected = language === lang.id;
                          return (
                            <button
                              key={lang.id}
                              type="button"
                              onClick={() => setLanguage(lang.id)}
                              title={lang.name}
                              className={`min-w-[48px] h-9 px-3 rounded-xl text-sm font-semibold tracking-wide transition-all cursor-pointer flex items-center justify-center ${
                                isSelected
                                  ? 'bg-white text-neutral-950 font-bold shadow-md scale-105'
                                  : 'bg-white/[0.05] hover:bg-white/[0.12] text-white/75 hover:text-white border border-white/[0.07]'
                              }`}
                            >
                              {lang.script}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Subtitles (Whole card clickable) */}
                    <div
                      onClick={() => setSubtitles(!subtitles)}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] border border-white/[0.05] cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5">
                        <Subtitles className="w-4 h-4 text-white/60" />
                        <span className="text-xs font-medium text-white/80">Show Subtitles</span>
                      </div>
                      <ToggleSwitch checked={subtitles} onChange={setSubtitles} label="Show Subtitles" />
                    </div>

                    {/* Fullscreen (Whole card clickable) */}
                    <div
                      onClick={toggleFullscreen}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] border border-white/[0.05] cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5">
                        <Monitor className="w-4 h-4 text-white/60" />
                        <span className="text-xs font-medium text-white/80 block">Fullscreen Mode</span>
                      </div>
                      <ToggleSwitch checked={fullscreen} onChange={toggleFullscreen} label="Fullscreen Mode" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2. VISUAL TAB ── */}
            {activeTab === 'visual' && (
              <div className="space-y-3">
                {/* Visual Graphics Card */}
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div>
                        <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                          Graphics Quality
                        </h3>
                        <p className="text-white/40 text-[11px] sm:text-xs mt-0.5">
                          Rendering detail, lighting and post-processing
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-white/50 capitalize">
                        {qualityPreset} Quality
                      </span>
                    </div>

                    {/* Three Images for Low, Medium, and High */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {[
                        { id: 'low' as const, label: 'Low', desc: 'Fast & Smooth', src: '/assets/presets/quality_low.svg' },
                        { id: 'medium' as const, label: 'Medium', desc: 'Balanced', src: '/assets/presets/quality_medium.svg' },
                        { id: 'high' as const, label: 'High', desc: 'Cinematic HDR', src: '/assets/presets/quality_high.svg' },
                      ].map((preset) => {
                        const isSelected = qualityPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setQualityPreset(preset.id)}
                            className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer text-left ${
                              isSelected
                                ? 'border-white bg-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.15)] ring-1 ring-white/50 scale-[1.02]'
                                : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 opacity-70 hover:opacity-100'
                            }`}
                          >
                            {/* Image Preview Container */}
                            <div className="relative w-full aspect-[16/9] overflow-hidden bg-black/40">
                              <img
                                src={preset.src}
                                alt={`${preset.label} Graphics Quality`}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow-md">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              )}
                            </div>

                            {/* Label & Description */}
                            <div className="p-2 sm:p-2.5 flex items-center justify-between">
                              <div>
                                <span className={`block text-xs font-bold ${isSelected ? 'text-white' : 'text-white/80'}`}>
                                  {preset.label}
                                </span>
                                <span className="text-[10px] text-white/40 block leading-tight">
                                  {preset.desc}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Effects Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Anti-Aliasing (Clickable card) */}
                    <div
                      onClick={() => setAntiAliasing(!antiAliasing)}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] border border-white/[0.05] cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5">
                        <Sparkles className="w-4 h-4 text-white/60" />
                        <span className="text-xs font-medium text-white/80">Anti-Aliasing (FXAA)</span>
                      </div>
                      <ToggleSwitch checked={antiAliasing} onChange={setAntiAliasing} label="Anti-Aliasing" />
                    </div>

                    {/* Bloom (Clickable card) */}
                    <div
                      onClick={() => setBloom(!bloom)}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] border border-white/[0.05] cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5">
                        <Sparkles className="w-4 h-4 text-white/60" />
                        <span className="text-xs font-medium text-white/80">HDR Bloom & Glow</span>
                      </div>
                      <ToggleSwitch checked={bloom} onChange={setBloom} label="Bloom" />
                    </div>
                  </div>

                  {/* Draw Distance (Separate card like Language) */}
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <Mountain className="w-4 h-4 text-white/60" />
                        <span className="text-xs font-medium text-white/80">Draw Distance</span>
                      </div>
                      <span className="text-[11px] text-white/50 font-medium">{drawDistance}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {['Low', 'Medium', 'High', 'Ultra'].map((opt) => {
                        const isSelected = drawDistance === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDrawDistance(opt)}
                            className={`min-w-[64px] h-9 px-3.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center justify-center ${
                              isSelected
                                ? 'bg-white text-neutral-950 font-bold shadow-md scale-105'
                                : 'bg-white/[0.05] hover:bg-white/[0.12] text-white/75 hover:text-white border border-white/[0.07]'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Traffic & Pedestrian Density (Separate card like Language) */}
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <Users className="w-4 h-4 text-white/60" />
                        <span className="text-xs font-medium text-white/80">Traffic & Pedestrian Density</span>
                      </div>
                      <span className="text-[11px] text-white/50 font-medium">{trafficDensity}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {['Low', 'Medium', 'High', 'Dense'].map((opt) => {
                        const isSelected = trafficDensity === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setTrafficDensity(opt)}
                            className={`min-w-[64px] h-9 px-3.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center justify-center ${
                              isSelected
                                ? 'bg-white text-neutral-950 font-bold shadow-md scale-105'
                                : 'bg-white/[0.05] hover:bg-white/[0.12] text-white/75 hover:text-white border border-white/[0.07]'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 3. AUDIO TAB ── */}
            {activeTab === 'audio' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                      Volume Channels
                    </h3>
                    <p className="text-white/40 text-[11px] sm:text-xs mt-0.5">
                      Independent controls for master audio, radio music and sound effects
                    </p>
                  </div>

                  <div className="space-y-4 pt-1">
                    {/* Master Volume */}
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-white/80 font-medium">
                          <Volume2 className="w-4 h-4 text-white/60" />
                          Master Volume
                        </span>
                        <span className="text-white/60 font-hud font-bold">{masterVolume}%</span>
                      </div>
                      <FilledSlider
                        min={0}
                        max={100}
                        value={masterVolume}
                        onChange={setMasterVolume}
                        ariaLabel="Master Volume"
                      />
                    </div>

                    {/* Radio Music Volume */}
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-white/80 font-medium">
                          <Music className="w-4 h-4 text-white/60" />
                          Radio & Ambience Music
                        </span>
                        <span className="text-white/60 font-hud font-bold">{musicVolume}%</span>
                      </div>
                      <FilledSlider
                        min={0}
                        max={100}
                        value={musicVolume}
                        onChange={setMusicVolume}
                        ariaLabel="Radio Music Volume"
                      />
                    </div>

                    {/* Sound Effects Volume */}
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-white/80 font-medium">
                          <AudioLines className="w-4 h-4 text-white/60" />
                          Sound Effects & Vehicles
                        </span>
                        <span className="text-white/60 font-hud font-bold">{sfxVolume}%</span>
                      </div>
                      <FilledSlider
                        min={0}
                        max={100}
                        value={sfxVolume}
                        onChange={setSfxVolume}
                        ariaLabel="Sound Effects Volume"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 4. CONTROLS TAB ── */}
            {activeTab === 'controls' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                      Camera & Input Preferences
                    </h3>
                    <p className="text-white/40 text-[11px] sm:text-xs mt-0.5">
                      Sensitivity, axis inversion, and haptic feedback
                    </p>
                  </div>

                  <div className="space-y-3 pt-1">
                    {/* Look Sensitivity */}
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-white/80 font-medium">
                          <Gamepad2 className="w-4 h-4 text-white/60" />
                          Look Sensitivity
                        </span>
                        <span className="text-white/60 font-hud font-bold">{sensitivity}%</span>
                      </div>
                      <FilledSlider
                        min={10}
                        max={100}
                        value={sensitivity}
                        onChange={setSensitivity}
                        ariaLabel="Look Sensitivity"
                      />
                    </div>

                    {/* Invert Y Axis (Clickable card) */}
                    <div
                      onClick={() => setInvertY(!invertY)}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] border border-white/[0.05] cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5">
                        <SlidersHorizontal className="w-4 h-4 text-white/60" />
                        <div>
                          <span className="text-xs font-medium text-white/80 block">Invert Vertical Look</span>
                          <span className="text-[10px] text-white/40">Inverts pitch rotation axis</span>
                        </div>
                      </div>
                      <ToggleSwitch checked={invertY} onChange={setInvertY} label="Invert Y" />
                    </div>

                    {/* Vibration / Haptics (Clickable card) */}
                    <div
                      onClick={() => setVibration(!vibration)}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.99] border border-white/[0.05] cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5">
                        <Gamepad2 className="w-4 h-4 text-white/60" />
                        <div>
                          <span className="text-xs font-medium text-white/80 block">Haptic Vibration</span>
                          <span className="text-[10px] text-white/40">Collision and vehicle feedback</span>
                        </div>
                      </div>
                      <ToggleSwitch checked={vibration} onChange={setVibration} label="Vibration" />
                    </div>
                  </div>
                </div>

                {/* Support Section below settings controls */}
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-display font-bold text-xs sm:text-sm text-white flex items-center space-x-2">
                        <HelpCircle className="w-4 h-4 text-white/70" />
                        <span>Controls Help & Support</span>
                      </h4>
                      <p className="text-white/40 text-[11px] sm:text-xs mt-0.5">
                        Keybindings reference, touch controls guide, and troubleshooting
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('support')}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white/90 hover:text-white border border-white/[0.08] transition-all cursor-pointer flex items-center space-x-1.5 active:scale-95"
                    >
                      <LifeBuoy className="w-3.5 h-3.5 text-white/70" />
                      <span>Support Hub</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] text-white/40 block">Drive / Steer</span>
                      <span className="font-semibold text-white/90">W A S D / Stick</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] text-white/40 block">Handbrake</span>
                      <span className="font-semibold text-white/90">Space / Drift</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] text-white/40 block">Nitro Boost</span>
                      <span className="font-semibold text-white/90">Shift / Boost</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] text-white/40 block">Camera View</span>
                      <span className="font-semibold text-white/90">C Key / Cam Icon</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 5. SUPPORT TAB ── */}
            {activeTab === 'support' && (
              <div className="space-y-3.5">
                {/* Support Header & Status Banner */}
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                        Player & Technical Support
                      </h3>
                      <p className="text-white/40 text-[11px] sm:text-xs mt-0.5">
                        Troubleshooting, FAQs, controls guide, and bug reporting
                      </p>
                    </div>
                    <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Systems Operational</span>
                    </div>
                  </div>
                </div>

                {/* Quick Help & FAQs Card */}
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-3">
                  <h4 className="font-display font-semibold text-xs text-white/90 flex items-center space-x-2">
                    <LifeBuoy className="w-4 h-4 text-white/60" />
                    <span>Frequently Asked Questions</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-1">
                      <span className="text-xs font-semibold text-white/90 block">🎮 Controls & Keybindings</span>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        Use WASD or Arrow keys to steer, Spacebar for handbrake, and Shift for nitro boost. On touchscreens, use the left on-screen joystick and right action pedals.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-1">
                      <span className="text-xs font-semibold text-white/90 block">⚡ Low FPS or Stuttering?</span>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        Switch to the <strong className="text-white/70">Low</strong> graphics preset in the Visual tab and reduce Draw Distance to Low/Medium for optimal 60+ FPS performance.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-1">
                      <span className="text-xs font-semibold text-white/90 block">🔊 Audio Not Playing?</span>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        Web browsers require an initial user tap/click before unmuting game sound. Check the Audio tab sliders and ensure your browser tab is not muted.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] space-y-1">
                      <span className="text-xs font-semibold text-white/90 block">📱 Mobile Fullscreen</span>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        Toggle Fullscreen in the General tab or add the game to your home screen (PWA) for an immersive, edge-to-edge mobile experience.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bug Report & Feedback Card */}
                <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.035] border border-white/[0.05] transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-semibold text-xs text-white/90 flex items-center space-x-2">
                      <Bug className="w-4 h-4 text-white/60" />
                      <span>Submit Bug Report or Feedback</span>
                    </h4>
                    <span className="text-[10px] text-white/40">Direct to Devs</span>
                  </div>

                  {supportSubmitted ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <p className="text-xs font-semibold text-white">Feedback Received!</p>
                      <p className="text-[11px] text-white/50">
                        Thank you for helping improve Lokam Mini. Our team reviews all reports.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSupportSubmitted(false);
                          setFeedbackText('');
                        }}
                        className="mt-2 text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                      >
                        Submit another report
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Category selector */}
                      <div className="flex gap-2">
                        {(['bug', 'suggestion', 'help'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setFeedbackType(type)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                              feedbackType === type
                                ? 'bg-white text-neutral-950 font-bold shadow-sm'
                                : 'bg-white/[0.04] text-white/60 hover:text-white border border-white/[0.06]'
                            }`}
                          >
                            {type === 'bug' ? '🐛 Bug Report' : type === 'suggestion' ? '💡 Feature Idea' : '❓ Assistance'}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Describe the issue or suggestion you encountered..."
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-white/30 text-white placeholder-white/30 text-xs outline-none resize-none transition-all"
                      />

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-white/40">
                          Diagnostics info will be automatically attached
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (feedbackText.trim()) {
                              setSupportSubmitted(true);
                            }
                          }}
                          disabled={!feedbackText.trim()}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                            feedbackText.trim()
                              ? 'bg-white text-neutral-950 hover:bg-white/90 active:scale-95 shadow-sm'
                              : 'bg-white/[0.05] text-white/30 cursor-not-allowed border border-white/[0.05]'
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Report</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Diagnostics & Info */}
                <div className="p-3.5 rounded-xl bg-white/[0.015] border border-white/[0.04] flex items-center justify-between text-[11px] text-white/40">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-white/30" />
                    <span>Lokam Mini Engine • Build 2026.10</span>
                  </div>
                  <span>WebGL 2.0 / Three.js 3D</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── MODAL FOOTER ── */}
        <div className="relative z-10 px-5 sm:px-7 py-4 bg-black/25 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
          {/* Reset Button (Left) */}
          <button
            onClick={handleReset}
            className="px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white font-medium text-xs sm:text-sm border border-white/[0.06] transition-all cursor-pointer active:scale-95 flex items-center space-x-2 min-h-[42px] sm:min-h-[44px]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset to Default</span>
          </button>

          {/* Action Buttons (Right) */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onClose}
              className="px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white font-medium text-xs sm:text-sm border border-white/[0.06] transition-all cursor-pointer active:scale-95 min-h-[42px] sm:min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white hover:bg-white/90 text-neutral-950 font-bold text-xs sm:text-sm transition-all flex items-center space-x-2 shadow-sm cursor-pointer active:scale-95 min-h-[42px] sm:min-h-[44px]"
            >
              <Check className="w-4.5 h-4.5 stroke-[2.5]" />
              <span>Apply Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
