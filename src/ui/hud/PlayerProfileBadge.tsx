/**
 * Lokam Mini — Player Profile Badge (Top-Right HUD)
 * Clean circular explorer avatar disc with a minimal crisp white border (no golden border).
 */

import React from 'react';

interface PlayerProfileBadgeProps {
  onClick?: () => void;
}

export const PlayerProfileBadge: React.FC<PlayerProfileBadgeProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      aria-label="Profile"
      className="flex items-center select-none pointer-events-auto cursor-pointer focus:outline-none active:scale-95 transition-transform"
    >
      {/* Circular Avatar with Minimal Crisp White Border */}
      <div className="relative flex-shrink-0 p-1">
        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.45)] overflow-hidden bg-sky-300 relative backdrop-blur-md">
          {/* Stylized Illustrated Explorer Avatar */}
          <svg viewBox="0 0 100 100" className="w-full h-full object-cover">
            {/* Sky background inside portrait */}
            <rect width="100" height="100" fill="#38bdf8" />
            <circle cx="50" cy="50" r="48" fill="#7dd3fc" />
            {/* Shirt collar */}
            <path d="M 22 100 Q 50 72 78 100 Z" fill="#0284c7" />
            <path d="M 36 100 L 50 82 L 64 100 Z" fill="#ffffff" />
            {/* Neck & Face */}
            <rect x="42" y="62" width="16" height="16" fill="#fbcfe8" rx="4" />
            <circle cx="50" cy="46" r="24" fill="#fde047" opacity="0.15" />
            <circle cx="50" cy="48" r="20" fill="#fcd34d" />
            {/* Cap */}
            <path d="M 24 40 C 24 24 35 18 50 18 C 65 18 76 24 76 40 Z" fill="#0369a1" />
            {/* Cap visor curved */}
            <path d="M 30 38 Q 72 32 82 42 Q 62 46 30 38 Z" fill="#0284c7" />
            {/* Eyes & Smile */}
            <circle cx="43" cy="48" r="2.5" fill="#0f172a" />
            <circle cx="57" cy="48" r="2.5" fill="#0f172a" />
            <circle cx="44" cy="47" r="0.8" fill="#ffffff" />
            <circle cx="58" cy="47" r="0.8" fill="#ffffff" />
            <path d="M 45 56 Q 50 61 55 56" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
            {/* Cute cheek blushes */}
            <circle cx="39" cy="53" r="2.5" fill="#f43f5e" opacity="0.4" />
            <circle cx="61" cy="53" r="2.5" fill="#f43f5e" opacity="0.4" />
          </svg>
        </div>
      </div>
    </button>
  );
};
