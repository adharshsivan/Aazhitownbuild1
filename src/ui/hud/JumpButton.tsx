/**
 * Lokam Mini — Jump Button (Bottom-Right Action Stack)
 * Monochrome smoked acrylic glass circular button with pure white jump icon.
 * Triggers jump / climb action on input service.
 */

import React, { useState } from 'react';
import { FaPersonRunning } from 'react-icons/fa6';
import type { InputService } from '../../input/InputService';

interface JumpButtonProps {
  inputService?: InputService;
  size?: number;
  onJump?: () => void;
}

export const JumpButton: React.FC<JumpButtonProps> = ({
  inputService,
  size = 58,
  onJump,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const triggerJump = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setIsPressed(true);
    onJump?.();
    if (inputService) {
      inputService.setVirtualAction('jump', true);
      setTimeout(() => {
        inputService.setVirtualAction('jump', false);
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
      onClick={triggerJump}
      onTouchStart={triggerJump}
      role="button"
      aria-label="Jump"
      title="Jump"
    >
      {/* Smoked Acrylic Glass Disc */}
      <div
        className={`w-full h-full rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_6px_20px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all ${
          isPressed
            ? 'scale-90 bg-black/60 shadow-[0_0_16px_rgba(255,255,255,0.3)]'
            : 'scale-100'
        }`}
      >
        <FaPersonRunning className="w-6.5 h-6.5 text-white drop-shadow-sm transition-transform" />
      </div>
    </div>
  );
};
