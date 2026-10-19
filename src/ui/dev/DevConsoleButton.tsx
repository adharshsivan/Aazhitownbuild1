/**
 * Small Discreet Dev Debug Button (Top-Center)
 * Opens the Aazhi Dev Settings Panel (Sky, Weather, Time, Flood, Optimization, Camera & Traffic Debug).
 */
import React from 'react';
import { Terminal } from 'lucide-react';

interface DevConsoleButtonProps {
  fpsText?: string;
}

export const DevConsoleButton: React.FC<DevConsoleButtonProps> = ({
  fpsText = '60 FPS',
}) => {
  return (
    <button
      id="wind-btn"
      type="button"
      title="Dev Debug Settings (Sky, Weather, Time, Flood, Camera, Optimization)"
      aria-label="Toggle Dev Debug Settings"
      className="fixed top-2.5 left-1/2 -translate-x-1/2 z-40 px-2.5 py-1 rounded-full font-mono text-[9.5px] tracking-wider uppercase flex items-center space-x-1.5 shadow-md border backdrop-blur-md transition-all cursor-pointer pointer-events-auto select-none bg-black/45 hover:bg-black/75 text-slate-200 border-white/15 opacity-75 hover:opacity-100 [&.active]:bg-emerald-950/90 [&.active]:text-emerald-300 [&.active]:border-emerald-500 [&.active]:opacity-100"
    >
      <Terminal className="w-3 h-3 text-emerald-400" />
      <span className="font-semibold text-[9px]">DEV DEBUG</span>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <span id="fps" className="text-slate-300 font-mono text-[8.5px] lowercase">{fpsText}</span>
    </button>
  );
};
