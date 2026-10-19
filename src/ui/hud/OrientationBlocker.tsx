/**
 * Lokam Mini — Orientation Blocker
 * Enforces horizontal landscape mode on mobile devices.
 * Shows a themed "Please Rotate Device" overlay with "Mobile Portrait Mode Coming Soon".
 */

import React, { useEffect, useState } from 'react';
import { Smartphone, RotateCw, Compass, Palmtree } from 'lucide-react';

export const OrientationBlocker: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);
  const [overrideAllowed, setOverrideAllowed] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      // Portrait is defined when height exceeds width and width is typical mobile/tablet width
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth <= 1024;
      setIsPortrait(portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait || overrideAllowed) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950 text-white select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-12 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-sm w-full text-center space-y-6 flex flex-col items-center">
        {/* Animated Phone Rotation Icon */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-30" />
          <div className="relative w-20 h-20 rounded-2xl bg-slate-800/80 border border-emerald-500/40 flex items-center justify-center shadow-xl backdrop-blur-sm">
            <Smartphone className="w-10 h-10 text-emerald-300 animate-pulse rotate-90" />
            <RotateCw className="w-5 h-5 text-amber-400 absolute -top-1 -right-1 animate-spin" style={{ animationDuration: '4s' }} />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-medium tracking-wide">
            <Palmtree className="w-3.5 h-3.5" />
            <span>LOKAM MINI • KOCHI ISLE</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white">
            Please Rotate Your Device
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-xs mx-auto">
            Lokam Mini is built for panoramic third-person horizontal exploration. Turn your screen sideways to begin.
          </p>
        </div>

        {/* Coming Soon Badge */}
        <div className="w-full p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 shadow-inner">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
            <Compass className="w-4 h-4 animate-spin" style={{ animationDuration: '8s' }} />
            <span>MOBILE PORTRAIT MODE</span>
          </div>
          <p className="text-xs text-slate-400">
            A vertical companion view is currently in development.
          </p>
          <div className="mt-2.5 inline-block text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
            COMING SOON
          </div>
        </div>

        {/* Desktop Dev Bypass Option */}
        <button
          onClick={() => setOverrideAllowed(true)}
          className="text-[11px] text-slate-500 hover:text-slate-300 underline underline-offset-4 transition-colors pt-2"
        >
          Developer Override (Preview in Portrait)
        </button>
      </div>
    </div>
  );
};
