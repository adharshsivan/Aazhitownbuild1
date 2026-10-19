/**
 * Lokam Mini — Web Controls Placeholder
 * Future-ready desktop keyboard & mouse control container.
 * Currently kept empty and lightweight, prepared for keybinding overlays (WASD, Space, Shift, E).
 */

import React from 'react';

interface WebControlsPlaceholderProps {
  showHint?: boolean;
}

export const WebControlsPlaceholder: React.FC<WebControlsPlaceholderProps> = ({
  showHint = false,
}) => {
  // Kept empty and future-ready as requested
  if (!showHint) {
    return (
      <div
        id="web-controls-root"
        className="pointer-events-none select-none hidden"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      id="web-controls-root"
      className="absolute bottom-24 left-4 z-20 pointer-events-none select-none hidden md:flex items-center space-x-2 text-[11px] font-mono text-white/50 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10"
    >
      <span className="font-semibold text-white/70">Keyboard:</span>
      <span>[WASD] Move</span>
      <span>•</span>
      <span>[Space] Jump</span>
      <span>•</span>
      <span>[Shift] Sprint</span>
      <span>•</span>
      <span>[E] Interact</span>
    </div>
  );
};
