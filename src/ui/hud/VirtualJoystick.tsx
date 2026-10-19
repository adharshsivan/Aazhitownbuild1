/**
 * Lokam Mini — Sleek Glass Virtual Joystick (Bottom-Left HUD)
 * - Circular smoked translucent glass disc with crisp specular metallic rim
 * - Minimal neat semi-transparent white directional arrows for sides (Up, Down, Left, Right)
 * - Pearlescent silver-white metallic glass draggable puck with soft pastel animated gradient border
 * - Clean interior puck without tiny inner dot
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { InputService } from '../../input/InputService';

interface VirtualJoystickProps {
  inputService?: InputService;
  size?: number;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  inputService,
  size = 142,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);

  const radius = size / 2;
  // Allows the inner circle puck to move a little bit beyond the main circle for tactile movement
  const maxDistance = radius + 10;
  const fullInputThreshold = radius - 6;

  const updatePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;

      const distance = Math.hypot(dx, dy);

      if (distance > maxDistance) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * maxDistance;
        dy = Math.sin(angle) * maxDistance;
      }

      setKnobOffset({ x: dx, y: dy });

      // Normalized coordinates (-1 to 1) clamped smoothly at full throw
      const normX = Math.max(-1, Math.min(1, dx / fullInputThreshold));
      const normY = Math.max(-1, Math.min(1, -dy / fullInputThreshold));

      if (inputService) {
        inputService.setVirtualMovement(normX, normY);
      }
    },
    [inputService, maxDistance, fullInputThreshold]
  );

  const resetPosition = useCallback(() => {
    setKnobOffset({ x: 0, y: 0 });
    setIsActive(false);
    touchIdRef.current = null;
    if (inputService) {
      inputService.setVirtualMovement(0, 0);
    }
  }, [inputService]);

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    setIsActive(true);
    updatePosition(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (touchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        updatePosition(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        resetPosition();
        break;
      }
    }
  };

  // Mouse Handlers (Desktop Testing)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsActive(true);
    updatePosition(e.clientX, e.clientY);

    const onMouseMove = (ev: MouseEvent) => {
      updatePosition(ev.clientX, ev.clientY);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      resetPosition();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    return () => {
      resetPosition();
    };
  }, [resetPosition]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      style={{ width: size, height: size }}
      className={`relative select-none pointer-events-auto touch-none cursor-pointer flex items-center justify-center rounded-full backdrop-blur-xl transition-colors duration-150 ${
        isActive
          ? 'bg-black/45 shadow-[0_10px_32px_rgba(0,0,0,0.4)]'
          : 'bg-black/35 hover:bg-black/45 shadow-[0_10px_32px_rgba(0,0,0,0.3)]'
      }`}
    >
      {/* ── 4 Minimal Neat Semi-Transparent White Directional Arrows for Sides ── */}
      {/* Up Arrow */}
      <div className={`absolute top-2.5 left-1/2 -translate-x-1/2 pointer-events-none z-10 drop-shadow-sm transition-colors ${isActive ? 'text-white/55' : 'text-white/40'}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-[2.2] stroke-linecap-round stroke-linejoin-round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </div>

      {/* Down Arrow */}
      <div className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 pointer-events-none z-10 drop-shadow-sm transition-colors ${isActive ? 'text-white/55' : 'text-white/40'}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-[2.2] stroke-linecap-round stroke-linejoin-round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Left Arrow */}
      <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 drop-shadow-sm transition-colors ${isActive ? 'text-white/55' : 'text-white/40'}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-[2.2] stroke-linecap-round stroke-linejoin-round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </div>

      {/* Right Arrow */}
      <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 drop-shadow-sm transition-colors ${isActive ? 'text-white/55' : 'text-white/40'}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-[2.2] stroke-linecap-round stroke-linejoin-round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </div>

      {/* Floating Center Draggable Puck with Premium Chromatic Glimmer Border (Matching Ride Tag Style) */}
      <div
        className={`w-13.5 h-13.5 z-20 rounded-full flex items-center justify-center pointer-events-none transition-transform duration-75 relative p-[2px] overflow-hidden shadow-[0_6px_20px_rgba(0,0,0,0.6),0_0_14px_rgba(255,255,255,0.2),0_0_20px_rgba(168,85,247,0.25)] ${
          isActive
            ? 'scale-95 shadow-[0_6px_22px_rgba(0,0,0,0.7),0_0_22px_rgba(255,255,255,0.4),0_0_28px_rgba(244,114,182,0.4)]'
            : 'scale-100'
        }`}
        style={{
          transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
        }}
      >
        {/* Continuous Live Prismatic Chromatic Conic Ring (Identical to Ride Border) */}
        <div className="absolute -inset-[200%] glimmer-border-glow pointer-events-none" />

        {/* Inner Neutral Smoked Glass Specular Puck Core */}
        <div className="relative z-10 w-full h-full rounded-full bg-[#0a0e17]/85 backdrop-blur-xl shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.35),0_2px_8px_rgba(0,0,0,0.4)]" />
      </div>
    </div>
  );
};
