/**
 * Lokam Mini — Interactive Radio Wheel Overlay
 * Exact shade of black matching other HUD buttons and controls:
 * - Bespoke, high-fidelity custom SVG icons for each station (Studio Mic, 80s Cassette, Vinyl LP, 90s Boombox, Antenna Tower, DJ Headphones, Electric Guitar, Power).
 * - Generous breathing room and optical spacing between icons, station names, and frequency tags.
 * - Selection-only updates for the central hub.
 * - 1:1 geometry with zero border halo or mismatched shadow.
 * - Neutral smoked black canvas (#0c0c0e with 94% opacity) and hairline subtle dividers.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, CircleDashed } from 'lucide-react';
import {
  FaPowerOff,
  FaRadio,
  FaCompactDisc,
  FaGuitar,
} from 'react-icons/fa6';
import { BsCassetteFill, BsBoomboxFill } from 'react-icons/bs';
import { RiHeadphoneFill } from 'react-icons/ri';
import { IoMusicalNotes } from 'react-icons/io5';
import { radioAudioService } from '../../services/radio/RadioAudioService';

interface RadioWheelOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeStationId?: string;
  onSelectStation?: (stationId: string) => void;
  onOpenStationsModal?: () => void;
  customStations?: StationItem[];
}

export interface StationItem {
  id: string;
  name: string;
  freq: string;
  angleDeg: number; // 0 is top (12 o'clock), clockwise
  iconType: 'power' | 'radio' | 'cassette' | 'vinyl' | 'boombox' | 'tune' | 'equalizer' | 'headphones' | 'guitar' | 'empty';
  colorHex: string; // Vibrant neon accent for boundary rim, icon & center hub
  streamUrl?: string;
  language?: 'tamil' | 'malayalam' | 'english' | string;
  isEmpty?: boolean;
}

export const STATIONS: StationItem[] = [
  {
    id: 'off',
    name: 'NO STATION',
    freq: 'OFF',
    angleDeg: 0,
    iconType: 'power',
    colorHex: '#ffffff',
    streamUrl: '',
  },
  {
    id: 'kalai_fm',
    name: 'KALAI FM TAMIL',
    freq: '88.1',
    angleDeg: 45,
    iconType: 'radio',
    colorHex: '#fb7185', // Vibrant Rose Pink
    streamUrl: 'https://stream.zenolive.com/2vghnwshsqzuv.aac',
    language: 'tamil',
  },
  {
    id: 'tamil_80s_radio',
    name: "TAMIL 80'S RADIO",
    freq: '90.6',
    angleDeg: 90,
    iconType: 'cassette',
    colorHex: '#fb923c', // Warm Amber Orange
    streamUrl: 'https://psrlive2.listenon.in/80?station=tamil80shitsradio',
    language: 'tamil',
  },
  {
    id: 'tamil_panpalai',
    name: 'TAMIL PANPALAI GO...',
    freq: '93.4',
    angleDeg: 135,
    iconType: 'vinyl',
    colorHex: '#10b981', // Emerald Green
    streamUrl: 'https://tamilpanpalai.radioca.st/ind',
    language: 'tamil',
  },
  {
    id: 'malayalam_986',
    name: '98.6 MALAYALAM RADIO',
    freq: '98.6',
    angleDeg: 180,
    iconType: 'boombox',
    colorHex: '#facc15', // Neon Gold Yellow
    streamUrl: 'https://stream.zeno.fm/512rbf1e3qzuv',
    language: 'malayalam',
  },
  {
    id: 'kj_yesudas',
    name: 'KJ YESUDAS RADIO',
    freq: '92.4',
    angleDeg: 225,
    iconType: 'tune',
    colorHex: '#d946ef', // Vibrant Magenta Violet
    streamUrl: 'https://stream.zeno.fm/9x1sw687nf9uv',
    language: 'malayalam',
  },
  {
    id: 'radio_mango',
    name: 'RADIO MANGO KOCHI',
    freq: '91.9',
    angleDeg: 270,
    iconType: 'headphones',
    colorHex: '#84cc16', // Neon Lime
    streamUrl: 'https://stream.zeno.fm/934u30kx8vzuv.aac',
    language: 'malayalam',
  },
  {
    id: 'sooriyan_fm',
    name: 'SOORIYAN FM',
    freq: '89.6',
    angleDeg: 315,
    iconType: 'guitar',
    colorHex: '#38bdf8', // Cyber Cyan Sky Blue
    streamUrl: 'https://radio.lotustechnologieslk.net:8006/;stream.mp3',
    language: 'tamil',
  },
];

export const RadioWheelOverlay: React.FC<RadioWheelOverlayProps> = ({
  isOpen,
  onClose,
  activeStationId = 'sooriyan_fm',
  onSelectStation,
  onOpenStationsModal,
  customStations,
}) => {
  const currentStations = customStations && customStations.length > 0 ? customStations : STATIONS;
  const [selectedId, setSelectedId] = useState<string>(activeStationId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Sync selectedId when activeStationId changes externally
  useEffect(() => {
    setSelectedId(activeStationId);
  }, [activeStationId]);

  // The central hub and active highlight strictly reflect the selected station (not hover)
  const selectedStation = currentStations.find((s) => s.id === selectedId) || currentStations[0] || STATIONS[0];
  const isSelectedEmptyOrOff = selectedStation.id === 'off' || selectedStation.id.startsWith('empty_') || !!selectedStation.isEmpty;

  // Handle mouse wheel scrolling to cycle through stations
  const lastScrollTimeRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleWindowWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastScrollTimeRef.current < 90) return;
      lastScrollTimeRef.current = now;

      setSelectedId((prevId) => {
        const currentIndex = currentStations.findIndex((s) => s.id === prevId);
        const validIndex = currentIndex === -1 ? 0 : currentIndex;
        let nextIndex: number;
        if (e.deltaY > 0) {
          nextIndex = (validIndex + 1) % currentStations.length;
        } else if (e.deltaY < 0) {
          nextIndex = (validIndex - 1 + currentStations.length) % currentStations.length;
        } else {
          return prevId;
        }
        const nextStation = currentStations[nextIndex];
        if (nextStation.id === 'off' || nextStation.id.startsWith('empty_') || nextStation.isEmpty) {
          radioAudioService.stop();
          onSelectStation?.('off');
        } else {
          radioAudioService.playStation(nextStation.id, nextStation.streamUrl, nextStation.name);
          onSelectStation?.(nextStation.id);
        }
        return nextStation.id;
      });
    };

    window.addEventListener('wheel', handleWindowWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWindowWheel);
    };
  }, [isOpen, onSelectStation, currentStations]);

  const handleStationClick = (id: string) => {
    setSelectedId(id);
    const station = currentStations.find((s) => s.id === id);
    if (id === 'off' || id.startsWith('empty_') || station?.isEmpty) {
      radioAudioService.stop();
      onSelectStation?.('off');
    } else if (station) {
      radioAudioService.playStation(station.id, station.streamUrl, station.name);
      onSelectStation?.(id);
    }
    setTimeout(() => {
      onClose();
    }, 280);
  };

  // Exact 1:1 SVG Geometry Dimensions
  const size = 500;
  const center = 250;
  const outerRadius = 248;
  const innerRadius = 86;
  const labelRadius = 172; // Optimized radius for generous breathing room

  // Render SVG Sector Slice Path
  const getSectorPath = (startAngleDeg: number, endAngleDeg: number) => {
    const startRad = ((startAngleDeg - 90) * Math.PI) / 180;
    const endRad = ((endAngleDeg - 90) * Math.PI) / 180;

    const x1 = center + innerRadius * Math.cos(startRad);
    const y1 = center + innerRadius * Math.sin(startRad);
    const x2 = center + outerRadius * Math.cos(startRad);
    const y2 = center + outerRadius * Math.sin(startRad);

    const x3 = center + outerRadius * Math.cos(endRad);
    const y3 = center + outerRadius * Math.sin(endRad);
    const x4 = center + innerRadius * Math.cos(endRad);
    const y4 = center + innerRadius * Math.sin(endRad);

    return `M ${x1} ${y1} L ${x2} ${y2} A ${outerRadius} ${outerRadius} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1} Z`;
  };

  // Render Arc Path for Active Outer Rim Highlight
  const getArcPath = (startAngleDeg: number, endAngleDeg: number) => {
    const startRad = ((startAngleDeg - 90) * Math.PI) / 180;
    const endRad = ((endAngleDeg - 90) * Math.PI) / 180;

    const x1 = center + outerRadius * Math.cos(startRad);
    const y1 = center + outerRadius * Math.sin(startRad);
    const x2 = center + outerRadius * Math.cos(endRad);
    const y2 = center + outerRadius * Math.sin(endRad);

    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 0 1 ${x2} ${y2}`;
  };

  // Render Premium Official Vector Icon Components (react-icons)
  const renderIcon = (type: StationItem['iconType'], isLarge = false) => {
    const szClass = isLarge ? 'w-8 h-8 sm:w-9 sm:h-9 drop-shadow-md' : 'w-6 h-6 sm:w-6.5 sm:h-6.5 drop-shadow-sm';

    switch (type) {
      case 'power':
        return <FaPowerOff className={szClass} />;

      case 'empty':
        return <CircleDashed className={szClass} strokeWidth={2.2} />;

      case 'radio':
        return <FaRadio className={szClass} />;

      case 'cassette':
        return <BsCassetteFill className={szClass} />;

      case 'vinyl':
        return <FaCompactDisc className={szClass} />;

      case 'boombox':
        return <BsBoomboxFill className={szClass} />;

      case 'tune':
      case 'equalizer':
        return <IoMusicalNotes className={szClass} />;

      case 'headphones':
        return <RiHeadphoneFill className={szClass} />;

      case 'guitar':
        return <FaGuitar className={szClass} />;

      default:
        return <FaRadio className={szClass} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 select-none flex flex-col items-center justify-center p-3 sm:p-5 -translate-y-4 sm:-translate-y-8 overflow-hidden transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] opacity-100 pointer-events-auto scale-100 animate-in fade-in zoom-in-95"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* ── TOP "STATIONS" PILL (Neutral Smoked Black Glass - Large Mobile Touch) ── */}
      <div className="mb-3 sm:mb-4 z-20 pointer-events-auto">
        <button
          onClick={() => {
            if (onOpenStationsModal) {
              onOpenStationsModal();
            } else {
              onClose();
            }
          }}
          className="px-5 py-2.5 sm:px-6 sm:py-2.5 rounded-full bg-black/60 hover:bg-black/75 backdrop-blur-md border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.4)] text-white font-hud text-xs sm:text-sm font-bold tracking-wider flex items-center space-x-2 transition-all active:scale-95 cursor-pointer min-h-[42px] sm:min-h-[44px]"
        >
          <SettingsIcon className="w-4 h-4 text-white/80" />
          <span>Stations</span>
        </button>
      </div>

      {/* ── RADIAL WHEEL CONTAINER (Strictly 1:1 Size Match, Zero Outer Spill, Smoked Glass Frosted Backdrop) ── */}
      <div className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] flex items-center justify-center rounded-full backdrop-blur-md">
        {/* SVG Slices Canvas with Drop Shadow Directly on SVG Geometry */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full filter drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
        >
          {/* Neutral Smoked Black Base Disc with 80% opacity for elegant translucency */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="#0c0c0e"
            fillOpacity="0.80"
          />

          {/* Dynamic Subtle Inside-the-Wheel Glow in Active Radio Color (Bounded strictly inside the disc, none if empty/off) */}
          <defs>
            <radialGradient id="wheelInsideGlow" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor={isSelectedEmptyOrOff ? '#ffffff' : selectedStation.colorHex}
                stopOpacity={isSelectedEmptyOrOff ? 0 : 0.35}
              />
              <stop
                offset="40%"
                stopColor={isSelectedEmptyOrOff ? '#ffffff' : selectedStation.colorHex}
                stopOpacity={isSelectedEmptyOrOff ? 0 : 0.22}
              />
              <stop
                offset="75%"
                stopColor={isSelectedEmptyOrOff ? '#ffffff' : selectedStation.colorHex}
                stopOpacity={isSelectedEmptyOrOff ? 0 : 0.08}
              />
              <stop
                offset="100%"
                stopColor={isSelectedEmptyOrOff ? '#ffffff' : selectedStation.colorHex}
                stopOpacity="0"
              />
            </radialGradient>
          </defs>
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="url(#wheelInsideGlow)"
            className="transition-all duration-350 pointer-events-none"
          />

          {/* 8 Radial Slices */}
          {currentStations.map((station) => {
            const isSelected = selectedId === station.id;
            const isHovered = hoveredId === station.id;
            const isSlotEmptyOrOff = station.id === 'off' || station.id.startsWith('empty_') || !!station.isEmpty;
            const sliceStartAngle = station.angleDeg - 22.5;
            const sliceEndAngle = station.angleDeg + 22.5;

            return (
              <g
                key={station.id}
                className="cursor-pointer transition-all duration-200"
                onClick={() => handleStationClick(station.id)}
                onMouseEnter={() => setHoveredId(station.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Wedge Background: Subtle active station color tint on active, subtle dark grey on hover, no color on empty/off */}
                <path
                  d={getSectorPath(sliceStartAngle, sliceEndAngle)}
                  fill={isSelected ? (isSlotEmptyOrOff ? '#ffffff' : station.colorHex) : isHovered ? '#ffffff' : 'transparent'}
                  fillOpacity={isSelected ? (isSlotEmptyOrOff ? 0.06 : 0.18) : isHovered ? 0.05 : 0}
                  className="transition-all duration-200"
                />

                {/* Outer Arc on Active Wedge: Signature Color or soft neutral on empty/off */}
                {isSelected && (
                  <path
                    d={getArcPath(sliceStartAngle, sliceEndAngle)}
                    fill="none"
                    stroke={isSlotEmptyOrOff ? 'rgba(255,255,255,0.35)' : station.colorHex}
                    strokeWidth={isSlotEmptyOrOff ? '2.5' : '4'}
                    strokeLinecap="round"
                    style={{
                      filter: isSlotEmptyOrOff ? undefined : `drop-shadow(0 0 6px ${station.colorHex})`,
                    }}
                    className="transition-all duration-300"
                  />
                )}
              </g>
            );
          })}

          {/* Subtle Dividing Radial Spoke Lines (Refined & Hairline Thin) */}
          {currentStations.map((station) => {
            const angleRad = ((station.angleDeg - 22.5 - 90) * Math.PI) / 180;
            const x1 = center + innerRadius * Math.cos(angleRad);
            const y1 = center + innerRadius * Math.sin(angleRad);
            const x2 = center + outerRadius * Math.cos(angleRad);
            const y2 = center + outerRadius * Math.sin(angleRad);

            const isBorderingActive =
              (selectedStation.id === station.id ||
              currentStations[(currentStations.findIndex((s) => s.id === selectedStation.id) + 1) % currentStations.length]?.id === station.id) &&
              !isSelectedEmptyOrOff;

            return (
              <line
                key={`spoke-${station.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isBorderingActive ? selectedStation.colorHex : '#ffffff'}
                strokeOpacity={isBorderingActive ? '0.65' : '0.045'}
                strokeWidth={isBorderingActive ? '1.2' : '0.8'}
                pointerEvents="none"
                className="transition-all duration-200"
              />
            );
          })}

          {/* Outer circle divider ring of the center hub with thin crisp active station color border */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke={isSelectedEmptyOrOff ? 'rgba(255,255,255,0.18)' : selectedStation.colorHex}
            strokeOpacity={isSelectedEmptyOrOff ? 0.3 : 0.9}
            strokeWidth="1.8"
            className="transition-all duration-300"
            pointerEvents="none"
          />
        </svg>

        {/* ── HTML OVERLAYS FOR ICONS & LABELS OVER EACH SECTOR ── */}
        <div className="absolute inset-0 pointer-events-none">
          {currentStations.map((station) => {
            const isSelected = selectedId === station.id;
            const isHovered = hoveredId === station.id;
            const isSlotEmptyOrOff = station.id === 'off' || station.id.startsWith('empty_') || !!station.isEmpty;
            const angleRad = ((station.angleDeg - 90) * Math.PI) / 180;
            const topPct = 50 + (labelRadius / center) * 50 * Math.sin(angleRad);
            const leftPct = 50 + (labelRadius / center) * 50 * Math.cos(angleRad);

            return (
              <div
                key={`label-${station.id}`}
                style={{
                  top: `${topPct}%`,
                  left: `${leftPct}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center transition-all duration-200 pointer-events-none ${
                  isSelected || isHovered ? 'scale-105' : 'scale-100'
                }`}
              >
                {/* Station Icon: Clean neutral white, no color if empty/off */}
                <div
                  style={{
                    color: isSelected ? (isSlotEmptyOrOff ? 'rgba(255,255,255,0.85)' : station.colorHex) : isSlotEmptyOrOff ? 'rgba(255,255,255,0.3)' : '#ffffff',
                    filter: isSelected && !isSlotEmptyOrOff ? `drop-shadow(0 0 5px ${station.colorHex})` : undefined,
                  }}
                  className="mb-2 sm:mb-2.5 transition-colors duration-200"
                >
                  {renderIcon(station.iconType)}
                </div>

                {/* Station Name: Crisp pure white or subtle neutral if empty/off */}
                <span className={`font-display text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.08em] leading-tight max-w-[90px] sm:max-w-[110px] line-clamp-2 ${
                  isSlotEmptyOrOff ? (isSelected ? 'text-white/85' : 'text-white/45') : 'text-white'
                } drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>
                  {station.name}
                </span>

                {/* Station Frequency: OFF or frequency value */}
                <span className={`font-hud text-[9px] sm:text-[10px] font-semibold mt-1 tracking-[0.12em] ${
                  isSlotEmptyOrOff ? (isSelected ? 'text-white/60' : 'text-white/28') : 'text-white/75'
                } drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]`}>
                  {station.freq}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── CENTER HUB DISC (Smoked Glass Translucent Disc with Subtle Soft Border) ── */}
        <div
          onClick={() => {
            if (!isSelectedEmptyOrOff) {
              handleStationClick('off');
            }
          }}
          title={isSelectedEmptyOrOff ? 'Select a Station' : 'Click to Turn Off Radio'}
          style={{
            borderColor: isSelectedEmptyOrOff ? 'rgba(255,255,255,0.14)' : `${selectedStation.colorHex}38`,
          }}
          className="absolute w-28 h-28 sm:w-34 sm:h-34 md:w-38 md:h-38 rounded-full bg-[#0c0c0e]/85 backdrop-blur-md border-[1.2px] flex flex-col items-center justify-center p-3 text-center pointer-events-auto z-30 cursor-pointer active:scale-95 transition-all duration-200 shadow-inner"
        >
          {/* Active Station Icon Glowing in Signature Color (or neutral white if empty/off) */}
          <div
            style={{
              color: isSelectedEmptyOrOff ? 'rgba(255,255,255,0.7)' : selectedStation.colorHex,
            }}
            className="mb-1.5 transition-colors duration-200"
          >
            {renderIcon(selectedStation.iconType, true)}
          </div>

          {/* Active Station Name in Signature Color (or crisp white if empty/off) */}
          <h3
            style={{
              color: isSelectedEmptyOrOff ? '#ffffff' : selectedStation.colorHex,
            }}
            className="font-display text-xs sm:text-[13.5px] font-extrabold tracking-[0.12em] uppercase leading-tight line-clamp-1 max-w-[95px] sm:max-w-[115px] transition-colors duration-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
          >
            {selectedStation.name}
          </h3>

          {/* Frequency in White with Transparency */}
          <span className="font-hud text-[9.5px] sm:text-[10.5px] font-semibold text-white/70 mt-0.5 tracking-[0.14em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
            {selectedStation.freq}
          </span>
        </div>
      </div>
    </div>
  );
};
