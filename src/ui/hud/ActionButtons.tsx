/**
 * Lokam Mini — Action Buttons (Bottom-Right HUD)
 * Replicates the four-button action cluster from "Refined four-button HUD over Kerala waters":
 * 1. Jump (Hero button: Leaping / Running athlete with upward arrow)
 * 2. Sprint (Sprinter in full stride)
 * 3. Interact (Hand tapping touch target)
 * 4. Backpack (Authentic rucksack backpack)
 * STRICTLY MONOCHROME WHITE (no yellow, no green, no blue, no colorful states).
 * Pure smoked acrylic glass with specular white rim and zero text labels.
 */

import React, { useState } from 'react';
import { MdTouchApp, MdBackpack, MdDirectionsRun, MdArrowUpward } from 'react-icons/md';
import { FaPersonRunning } from 'react-icons/fa6';
import type { InputService } from '../../input/InputService';

interface ActionButtonsProps {
  inputService?: InputService;
  onOpenInventory?: () => void;
  onInteract?: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  inputService,
  onOpenInventory,
  onInteract,
}) => {
  const [isJumping, setIsJumping] = useState(false);
  const [isSprinting, setIsSprinting] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  const handleJumpDown = () => {
    setIsJumping(true);
    inputService?.setVirtualAction('jump', true);
  };

  const handleJumpUp = () => {
    setIsJumping(false);
    inputService?.setVirtualAction('jump', false);
  };

  const handleSprintDown = () => {
    setIsSprinting(true);
    inputService?.setVirtualAction('sprint', true);
  };

  const handleSprintUp = () => {
    setIsSprinting(false);
    inputService?.setVirtualAction('sprint', false);
  };

  const handleInteractDown = () => {
    setIsInteracting(true);
    inputService?.setVirtualAction('interact', true);
    onInteract?.();
  };

  const handleInteractUp = () => {
    setIsInteracting(false);
    inputService?.setVirtualAction('interact', false);
  };

  return (
    <div className="relative select-none pointer-events-auto touch-none">
      {/* 
        Two-column arrangement matching the reference image:
        - Left column: Interact (top), Sprint (bottom)
        - Right column: Backpack (top), Jump (bottom, largest hero button)
      */}
      <div className="flex items-end space-x-3.5 sm:space-x-4">
        {/* ── LEFT COLUMN: Interact & Sprint ── */}
        <div className="flex flex-col items-center space-y-3.5 sm:space-y-4">
          {/* 1. Interact Button (Top-Left) - STRICTLY MONOCHROME */}
          <button
            onTouchStart={handleInteractDown}
            onTouchEnd={handleInteractUp}
            onTouchCancel={handleInteractUp}
            onMouseDown={handleInteractDown}
            onMouseUp={handleInteractUp}
            onMouseLeave={handleInteractUp}
            aria-label="Interact"
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full backdrop-blur-xl border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex items-center justify-center transition-all focus:outline-none cursor-pointer ${
              isInteracting
                ? 'bg-white/25 border-white scale-90 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                : 'bg-black/50 hover:bg-black/65 active:scale-95 text-white'
            }`}
          >
            <MdTouchApp className="w-10 h-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
          </button>

          {/* 2. Sprint Button (Bottom-Left) - STRICTLY MONOCHROME (NO YELLOW) */}
          <button
            onTouchStart={handleSprintDown}
            onTouchEnd={handleSprintUp}
            onTouchCancel={handleSprintUp}
            onMouseDown={handleSprintDown}
            onMouseUp={handleSprintUp}
            onMouseLeave={handleSprintUp}
            aria-label="Sprint"
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full backdrop-blur-xl border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex items-center justify-center transition-all focus:outline-none cursor-pointer ${
              isSprinting
                ? 'bg-white/25 border-white scale-90 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                : 'bg-black/50 hover:bg-black/65 active:scale-95 text-white'
            }`}
          >
            <FaPersonRunning className="w-9 h-9 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
          </button>
        </div>

        {/* ── RIGHT COLUMN: Backpack & Large Jump ── */}
        <div className="flex flex-col items-center space-y-3.5 sm:space-y-4">
          {/* 3. Backpack Button (Top-Right) - STRICTLY MONOCHROME */}
          <button
            onClick={onOpenInventory}
            aria-label="Backpack"
            className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-black/50 hover:bg-black/65 active:scale-95 backdrop-blur-xl border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.4)] text-white flex items-center justify-center transition-all focus:outline-none cursor-pointer"
          >
            <MdBackpack className="w-10 h-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
          </button>

          {/* 4. Jump / Climb Hero Button (Bottom-Right, Largest Disc) - STRICTLY MONOCHROME (NO GREEN) */}
          <button
            onTouchStart={handleJumpDown}
            onTouchEnd={handleJumpUp}
            onTouchCancel={handleJumpUp}
            onMouseDown={handleJumpDown}
            onMouseUp={handleJumpUp}
            onMouseLeave={handleJumpUp}
            aria-label="Jump"
            className={`w-23 h-23 sm:w-25 sm:h-25 rounded-full backdrop-blur-xl border-2 border-white/75 shadow-[0_12px_36px_rgba(0,0,0,0.45)] flex items-center justify-center transition-all focus:outline-none cursor-pointer ${
              isJumping
                ? 'bg-white/25 border-white scale-90 shadow-[0_0_25px_rgba(255,255,255,0.4)]'
                : 'bg-black/55 hover:bg-black/70 active:scale-95 text-white'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <MdDirectionsRun className="w-13 h-13 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] -ml-1" />
              <MdArrowUpward className="w-5 h-5 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)] stroke-[1.5] -mr-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
