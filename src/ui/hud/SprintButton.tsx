/**
 * Lokam Mini — Sprint Button (Bottom-Right HUD)
 * Clean, sleek transparent black circular button with official running icon.
 * Loader-like border arc removed as requested.
 */

import React, { useState } from 'react';
import { MdDirectionsRun } from 'react-icons/md';
import type { InputService } from '../../input/InputService';

interface SprintButtonProps {
  inputService?: InputService;
  size?: number;
}

export const SprintButton: React.FC<SprintButtonProps> = ({
  inputService,
  size = 58,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const startSprint = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setIsPressed(true);
    if (inputService) {
      inputService.setVirtualAction('sprint', true);
    }
  };

  const endSprint = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setIsPressed(false);
    if (inputService) {
      inputService.setVirtualAction('sprint', false);
    }
  };

  return (
    <div
      style={{ width: size, height: size }}
      className="relative select-none pointer-events-auto touch-none flex items-center justify-center cursor-pointer"
      onTouchStart={startSprint}
      onTouchEnd={endSprint}
      onTouchCancel={endSprint}
      onMouseDown={startSprint}
      onMouseUp={endSprint}
      onMouseLeave={endSprint}
      role="button"
      aria-label="Sprint"
    >
      {/* Balanced Smoked Glass Disc (Without loader border) */}
      <div
        className={`w-full h-full rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_6px_20px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all ${
          isPressed
            ? 'scale-90 bg-black/60 shadow-[0_0_16px_rgba(255,255,255,0.3)]'
            : 'scale-100'
        }`}
      >
        {/* Real Athletic Sprint Icon */}
        <MdDirectionsRun className="w-8 h-8 text-white drop-shadow-sm transition-transform" />
      </div>
    </div>
  );
};
