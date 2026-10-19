/**
 * Lokam Mini — Fist Button (Bottom-Right Action Stack)
 * Monochrome smoked acrylic glass button with pure white fist / punch icon.
 * Sized identically to Jump and Bag for optical symmetry.
 */

import React, { useState } from 'react';
import { FaFistRaised } from 'react-icons/fa';
import type { InputService } from '../../input/InputService';

interface FistButtonProps {
  inputService?: InputService;
  size?: number;
  onPunch?: () => void;
}

export const FistButton: React.FC<FistButtonProps> = ({
  inputService,
  size = 58,
  onPunch,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const triggerPunch = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setIsPressed(true);
    onPunch?.();
    if (inputService) {
      inputService.setVirtualAction('primaryAction', true);
      // Guarantee at least 250ms activation for game loop tick
      setTimeout(() => {
        inputService.setVirtualAction('primaryAction', false);
        setIsPressed(false);
      }, 250);
    } else {
      setTimeout(() => setIsPressed(false), 250);
    }
  };

  return (
    <div
      style={{ width: size, height: size }}
      className="relative select-none pointer-events-auto touch-none flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
      onClick={triggerPunch}
      onTouchStart={triggerPunch}
      role="button"
      aria-label="Fist Attack"
      title="Fist / Attack"
    >
      {/* Balanced Smoked Glass Disc */}
      <div
        className={`w-full h-full rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_6px_20px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all ${
          isPressed
            ? 'scale-90 bg-black/60 shadow-[0_0_16px_rgba(255,255,255,0.3)]'
            : 'scale-100'
        }`}
      >
        {/* Real Classic Upright Fist Icon */}
        <FaFistRaised className="w-6.5 h-6.5 text-white drop-shadow-sm transition-transform" />
      </div>
    </div>
  );
};
