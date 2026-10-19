/**
 * Lokam Mini — Synchronized Reactive Minimap Radar (Top-Left HUD)
 * - Map translates and rotates dynamically in real-time tracking the player's walking movement and heading.
 * - 3 directional tick lines (East, South, West) + North marker ("N") rotate around the perimeter as the player walks.
 * - Does not rotate when merely looking around with the camera.
 * - Compact 'N' badge size with always-upright text for perfect legibility.
 */

import React, { useState, useEffect, useRef } from 'react';
import type { LokamGame } from '../../app/game/LokamGame';
import type { InputService } from '../../input/InputService';
import type { CharacterModule } from '../../characters/CharacterModule';

interface MinimapProps {
  game?: LokamGame | null;
  inputService?: InputService;
  playerHeading?: number;
  locationTitle?: string;
}

export const Minimap: React.FC<MinimapProps> = ({
  game,
  inputService,
  playerHeading = 0,
}) => {
  // Dynamic player position & walking heading updated in real-time from 3D player controller
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [heading, setHeading] = useState(playerHeading);

  const posRef = useRef({ x: 0, y: 0 });
  const headingRef = useRef(playerHeading);
  const lastWorldPosRef = useRef<{ x: number; z: number } | null>(null);

  // Subscribe to EventBus and run high-rate rAF loop to ensure 60fps buttery tracking while walking
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const eventBus = game?.services.eventBus;
    let unbindEvent: (() => void) | null = null;

    if (eventBus) {
      unbindEvent = eventBus.on('player:moved', (data: any) => {
        if (data.position) {
          const relX = data.position[0];
          const relZ = data.position[2] - 10;
          posRef.current.x = -relX * 1.8;
          posRef.current.y = -relZ * 1.8;
        }

        if (typeof data.heading === 'number') {
          const targetScreenAngle = ((180 - data.heading) % 360 + 360) % 360;
          let diff = (targetScreenAngle - (headingRef.current % 360) + 540) % 360 - 180;
          headingRef.current += diff * 0.4;
        }
      });
    }

    const updateLoop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (game) {
        try {
          const charModule = game.lifecycle.get('character') as CharacterModule | undefined;
          const player = charModule?.getPlayer?.() as any;

          if (player) {
            const pos = player.getPosition();
            const relX = pos.x;
            const relZ = pos.z - 10;
            const targetMapX = -relX * 1.8;
            const targetMapY = -relZ * 1.8;

            const clampedX = Math.max(-45, Math.min(45, targetMapX));
            const clampedY = Math.max(-55, Math.min(55, targetMapY));

            posRef.current.x += (clampedX - posRef.current.x) * Math.min(1, dt * 14);
            posRef.current.y += (clampedY - posRef.current.y) * Math.min(1, dt * 14);

            // Detect actual walking / vehicle movement so minimap rotates strictly while moving, never while just looking
            let isMoving = (player.speed ?? 0) > 0.05;
            if (lastWorldPosRef.current) {
              const movedDist = Math.hypot(
                pos.x - lastWorldPosRef.current.x,
                pos.z - lastWorldPosRef.current.z
              );
              if (movedDist > 0.002) isMoving = true;
            } else {
              // Initialize heading on first frame
              const initDeg = (player.getHeading() * 180) / Math.PI;
              headingRef.current = ((180 - initDeg) % 360 + 360) % 360;
            }
            lastWorldPosRef.current = { x: pos.x, z: pos.z };

            if (isMoving) {
              const playerHeadingDeg = (player.getHeading() * 180) / Math.PI;
              const targetScreenAngle = ((180 - playerHeadingDeg) % 360 + 360) % 360;
              const currentMod = ((headingRef.current % 360) + 360) % 360;
              let diffH = targetScreenAngle - currentMod;
              if (diffH > 180) diffH -= 360;
              if (diffH < -180) diffH += 360;
              headingRef.current += diffH * Math.min(1, dt * 14);
            }
          }
        } catch {
          // Graceful fallback
        }
      } else if (inputService) {
        const move = inputService.current.movement;
        if (Math.abs(move.x) > 0.05 || Math.abs(move.y) > 0.05) {
          posRef.current.x += move.x * 20 * dt;
          posRef.current.y += move.y * 20 * dt;
          posRef.current.x = Math.max(-35, Math.min(35, posRef.current.x));
          posRef.current.y = Math.max(-35, Math.min(35, posRef.current.y));

          const targetAngle = ((Math.atan2(move.x, -move.y) * (180 / Math.PI)) % 360 + 360) % 360;
          const currentMod = ((headingRef.current % 360) + 360) % 360;
          let diff = targetAngle - currentMod;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          headingRef.current += diff * Math.min(1, dt * 14);
        }
      }

      setPosition({ ...posRef.current });
      setHeading(headingRef.current);

      animId = requestAnimationFrame(updateLoop);
    };

    animId = requestAnimationFrame(updateLoop);
    return () => {
      cancelAnimationFrame(animId);
      if (unbindEvent) unbindEvent();
    };
  }, [game, inputService]);

  return (
    <div className="relative select-none pointer-events-auto">
      {/* Main Radar Circle with Glass Translucency & Crisp White Border */}
      <div className="relative w-28 h-28 sm:w-30 sm:h-30 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden bg-black/20 backdrop-blur-[2px] border-2 border-white">
        {/* Rotating Map Container (Pivots around player center as player walks) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `rotate(${-heading}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {/* Dynamic Moving Map Texture Layer (Semi-transparent so 3D background shines through) */}
          <div
            className="absolute top-1/2 left-1/2 w-[240%] h-[240%] max-w-none pointer-events-none opacity-50"
            style={{
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(1.15)`,
            }}
          >
            <img
              src="/src/assets/images/fantasy_rpg_minimap_1790933642326.jpg"
              alt="Island Minimap"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          </div>
        </div>

        {/* Forward Walking Cone */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-16 h-16 -translate-y-3">
            <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
              <defs>
                <radialGradient id="camVisionGlow" cx="50%" cy="100%" r="90%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </radialGradient>
              </defs>
              <polygon points="50,90 20,10 80,10" fill="url(#camVisionGlow)" />
            </svg>
          </div>
        </div>

        {/* Center Golden Player Direction Arrow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-5 h-5 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-full h-full filter drop-shadow-[0_1.5px_4px_rgba(0,0,0,0.85)]"
            >
              <polygon
                points="12,2 20,20 12,15 4,20"
                fill="#facc15"
                stroke="#0f172a"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <polygon points="12,2 12,15 4,20" fill="#fde047" opacity="0.85" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── ROTATING CARDINAL COMPASS FRAME (North 'N' & Directional Lines Rotate While Walking) ── */}
      <div
        className="absolute inset-0 pointer-events-none z-30"
        style={{
          transform: `rotate(${-heading}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {/* 1. East Axis Direction Line (+90° from North) */}
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-2 h-[1.5px] bg-white shadow-sm" />

        {/* 2. South Axis Direction Line (+180° from North) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1.5px] h-2 bg-white shadow-sm" />

        {/* 3. West Axis Direction Line (+270° from North) */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-[1.5px] bg-white shadow-sm" />

        {/* 4. North Axis Marker Badge ('N' - Orbits with True North, letter counter-rotates and stays optically dead-centered) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center pointer-events-auto">
          <svg viewBox="0 0 20 20" className="w-5 h-5 filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] overflow-visible">
            <circle cx="10" cy="10" r="9" fill="#090d16" stroke="#ffffff" strokeWidth="1.4" />
            <g transform={`rotate(${heading} 10 10)`}>
              <text
                x="10"
                y="10.2"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize="10"
                fontWeight="900"
                fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              >
                N
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
