/**
 * Lokam Mini — Enter / Exit Button (Bottom-Right Action Stack)
 * Monochrome smoked acrylic glass button that lets the player enter a car or building,
 * and switches to Exit when inside a car or building so clicking Exit gets the player out.
 */

import React, { useState } from 'react';
import { FaRightToBracket, FaRightFromBracket } from 'react-icons/fa6';

interface BagButtonProps {
  size?: number;
  isInside?: boolean;
  onOpenBag?: () => void;
}

export const BagButton: React.FC<BagButtonProps> = ({
  size = 58,
  isInside = false,
  onOpenBag,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 150);
    onOpenBag?.();
  };

  return (
    <div
      style={{ width: size, height: size }}
      className="relative select-none pointer-events-auto touch-none flex items-center justify-center cursor-pointer"
      onClick={handleClick}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      role="button"
      aria-label={isInside ? 'Exit' : 'Enter'}
      title={isInside ? 'Exit Car / Building' : 'Enter Car / Building'}
    >
      {/* Balanced Smoked Glass Disc */}
      <div
        className={`w-full h-full rounded-full backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_6px_20px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all ${
          isInside
            ? 'bg-white/20 hover:bg-white/30 ring-1 ring-white/40'
            : 'bg-black/40 hover:bg-black/55'
        } ${
          isPressed
            ? 'scale-90 bg-black/60 shadow-[0_0_16px_rgba(255,255,255,0.3)]'
            : 'scale-100'
        }`}
      >
        {isInside ? (
          <FaRightFromBracket className="w-6.5 h-6.5 text-white drop-shadow-sm transition-transform" />
        ) : (
          <FaRightToBracket className="w-6.5 h-6.5 text-white drop-shadow-sm transition-transform" />
        )}
      </div>
    </div>
  );
};
