/**
 * Lokam Mini — Minimal Activity, Buildings & Gestures Dock Popup
 * Displays a sleek, smoked acrylic glass horizontal selection card directly above the bottom action bar.
 * Features:
 * - Gestures: Smooth horizontal scroll track with mouse-drag, mouse-wheel, touch-pan, and dynamic progress bar.
 * - Mini Games & Buildings: Clean 5-column fitted grid (no scrolling needed).
 * - Unique stylish glowing neon border & soft specular tint for each individual item.
 * - Tactile auto-close on selection.
 */

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Gamepad2,
  Building2,
  X,
  Bike,
  Package,
  Sailboat,
  Store,
  Anchor,
  Landmark,
  Compass,
  Film,
  Coffee,
  ShoppingBag,
  Hand,
  PartyPopper,
  ThumbsUp,
  Sparkles,
  Armchair,
  Smile,
  Flame,
  Heart,
  Shield,
  Sun,
} from 'lucide-react';
import { GiFishingHook } from 'react-icons/gi';
import { FaPersonRunning } from 'react-icons/fa6';
import { IoFootballOutline, IoBagHandleOutline } from 'react-icons/io5';
import { MdEmojiPeople } from 'react-icons/md';

export type ActivityPopupType = 'games' | 'city' | 'gestures';

export interface ActivityItem {
  id: string;
  title: string;
  color: string;
  icon: React.ReactNode;
}

export const MINI_GAMES: ActivityItem[] = [
  {
    id: 'cycling_race',
    title: 'Cycling\nRace',
    color: '#38bdf8', // Electric Cyan Blue
    icon: <Bike className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'fishing',
    title: 'Fishing',
    color: '#06b6d4', // Teal Aqua
    icon: <GiFishingHook className="w-7.5 h-7.5 text-white" />,
  },
  {
    id: 'delivery_run',
    title: 'Delivery\nRun',
    color: '#f59e0b', // Warm Amber
    icon: <Package className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'boat_race',
    title: 'Boat\nRace',
    color: '#818cf8', // Indigo Blue
    icon: <Sailboat className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'parkour',
    title: 'Parkour',
    color: '#ec4899', // Hot Pink
    icon: <FaPersonRunning className="w-7.5 h-7.5 text-white" />,
  },
];

export const CITY_BUILDINGS: ActivityItem[] = [
  {
    id: 'sarvam_theater',
    title: 'Sarvam\nTheater',
    color: '#c026d3', // Neon Magenta Purple
    icon: <Film className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'heritage_museum',
    title: 'Heritage\nMuseum',
    color: '#f59e0b', // Royal Antique Amber Gold
    icon: <Landmark className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'aazhi_stadium',
    title: 'Aazhi\nStadium',
    color: '#10b981', // Emerald Arena Green
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-7.5 h-7.5 text-white"
      >
        <circle cx="12" cy="12" r="10" />
        <polygon points="12 7 15.5 9.5 14 14 10 14 8.5 9.5" />
        <line x1="12" y1="7" x2="12" y2="2" />
        <line x1="15.5" y1="9.5" x2="19.5" y2="7.5" />
        <line x1="14" y1="14" x2="17.5" y2="18.5" />
        <line x1="10" y1="14" x2="6.5" y2="18.5" />
        <line x1="8.5" y1="9.5" x2="4.5" y2="7.5" />
      </svg>
    ),
  },
  {
    id: 'cafe_rooftop',
    title: 'Cafe\nRooftop',
    color: '#f43f5e', // Sunset Rose Coral
    icon: <Coffee className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'paradise_mall',
    title: 'Paradise\nMall',
    color: '#0284c7', // Sky Cyan Blue
    icon: <ShoppingBag className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
];

export const GESTURES_LIST: ActivityItem[] = [
  {
    id: 'wave',
    title: 'Wave\nHello',
    color: '#38bdf8', // Sky Cyan
    icon: <Hand className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'dance',
    title: 'Kerala\nDance',
    color: '#f43f5e', // Rose Pink
    icon: <PartyPopper className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'cheer',
    title: 'Cheer\n& Clap',
    color: '#fbbf24', // Amber Gold
    icon: <ThumbsUp className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'namaste',
    title: 'Namaste\nBow',
    color: '#a855f7', // Purple Violet
    icon: <Sparkles className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'sit',
    title: 'Sit &\nRelax',
    color: '#34d399', // Mint Green
    icon: <Armchair className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'laugh',
    title: 'Joy &\nLaugh',
    color: '#fb923c', // Coral Orange
    icon: <Smile className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'flex',
    title: 'Power\nPose',
    color: '#ef4444', // Crimson Flame
    icon: <Flame className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'love',
    title: 'Send\nHeart',
    color: '#ec4899', // Hot Pink
    icon: <Heart className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'salute',
    title: 'Honor\nSalute',
    color: '#6366f1', // Indigo Blue
    icon: <Shield className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
  {
    id: 'meditate',
    title: 'Peace &\nZen',
    color: '#10b981', // Emerald Green
    icon: <Sun className="w-7.5 h-7.5 text-white stroke-[2]" />,
  },
];

interface ActivityDockPopupProps {
  type: ActivityPopupType;
  isOpen: boolean;
  onClose: () => void;
  onSelectItem?: (item: ActivityItem) => void;
}

export const ActivityDockPopup: React.FC<ActivityDockPopupProps> = ({
  type,
  isOpen,
  onClose,
  onSelectItem,
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mouse Drag to Scroll State
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const getDefaultSelectedId = () => {
    if (type === 'games') return 'cycling_race';
    if (type === 'city') return 'fort_pier';
    return 'wave';
  };

  const [selectedId, setSelectedId] = useState<string>(getDefaultSelectedId);

  // Clean up any pending auto-close timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Update scroll progress
  const updateScrollProgress = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll > 4) {
      const progress = Math.min(Math.max(scrollLeft / maxScroll, 0), 1);
      setScrollProgress(progress);
    } else {
      setScrollProgress(0);
    }
  };

  useLayoutEffect(() => {
    if (isRendered && type === 'gestures') {
      updateScrollProgress();
    }
  }, [isRendered, type]);

  // Mouse drag handlers for desktop smooth dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeftRef.current - walk;
    if (Math.abs(walk) > 6) {
      hasDraggedRef.current = true;
    }
    updateScrollProgress();
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scrollRef.current.scrollLeft += e.deltaY;
      updateScrollProgress();
    }
  };

  if (!isOpen) return null;

  let items = MINI_GAMES;
  let title = 'Mini Games';
  let subtitle = 'Choose an activity';
  let headerIcon = <Gamepad2 className="w-5.5 h-5.5 stroke-[2]" />;
  const isScrollable = type === 'gestures';

  if (type === 'city') {
    items = CITY_BUILDINGS;
    title = 'City & Places';
    subtitle = 'Choose a destination';
    headerIcon = <Building2 className="w-5.5 h-5.5 stroke-[2]" />;
  } else if (type === 'gestures') {
    items = GESTURES_LIST;
    title = 'Gestures & Emotes';
    subtitle = 'Express yourself';
    headerIcon = <MdEmojiPeople className="w-6 h-6 text-white" />;
  }

  const handleCardClick = (item: ActivityItem) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    setSelectedId(item.id);
    onSelectItem?.(item);

    // Smooth auto-close after subtle tactile feedback
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div
      className="absolute bottom-20 sm:bottom-22 left-1/2 -translate-x-1/2 z-50 pointer-events-auto select-none animate-in fade-in zoom-in-95 duration-200 origin-bottom"
      style={{ maxWidth: '94vw', width: isScrollable ? '580px' : '560px' }}
    >
      {/* Outer Smoked Frosted Glass Capsule */}
      <div className="relative rounded-3xl bg-black/65 hover:bg-black/75 backdrop-blur-2xl p-4 sm:p-5 shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(255,255,255,0.18)] transition-all">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-black/40 flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
              {headerIcon}
            </div>
            <div>
              <h3 className="text-white font-semibold text-base sm:text-lg leading-tight tracking-wide">
                {title}
              </h3>
              <p className="text-white/60 text-xs sm:text-sm font-normal">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={handleClose}
            aria-label="Close popup"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/60 active:scale-95 text-white/80 hover:text-white flex items-center justify-center transition-all focus:outline-none cursor-pointer"
          >
            <X className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>
        </div>

        {/* Content Area: Scrollable Track for Gestures, Fitted 5-Grid for Mini-Games & Buildings */}
        {isScrollable ? (
          <div
            ref={scrollRef}
            onScroll={updateScrollProgress}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onWheel={handleWheel}
            className="flex space-x-2.5 sm:space-x-3 overflow-x-auto overflow-y-hidden pb-1 pt-1 px-1 scrollbar-none touch-pan-x cursor-grab active:cursor-grabbing select-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {items.map((item) => {
              const isSelected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  style={{
                    backgroundColor: isSelected ? `${item.color}22` : undefined,
                    boxShadow: isSelected
                      ? `0 0 20px ${item.color}80, inset 0 0 12px ${item.color}35`
                      : undefined,
                  }}
                  className={`flex-shrink-0 relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-180 focus:outline-none cursor-pointer group w-[88px] sm:w-[98px] min-h-[86px] sm:min-h-[96px] ${
                    isSelected
                      ? 'scale-[1.03]'
                      : 'bg-black/35 hover:bg-black/50 text-white/80 active:scale-95'
                  }`}
                >
                  {/* Icon */}
                  <div
                    style={{
                      filter: isSelected ? `drop-shadow(0 0 6px ${item.color})` : undefined,
                    }}
                    className={`flex items-center justify-center transition-transform ${
                      isSelected ? 'scale-110' : 'group-hover:scale-105'
                    }`}
                  >
                    {item.icon}
                  </div>

                  {/* Title */}
                  <div className="flex flex-col items-center mt-2 w-full">
                    <span className="text-white font-medium text-[11px] sm:text-xs text-center leading-tight whitespace-pre-line line-clamp-2">
                      {item.title}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Fitted 5-Column Grid for Games & Buildings (No Scroll Needed) */
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {items.map((item) => {
              const isSelected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  style={{
                    borderColor: isSelected ? item.color : undefined,
                    backgroundColor: isSelected ? `${item.color}22` : undefined,
                    boxShadow: isSelected
                      ? `0 0 20px ${item.color}80, inset 0 0 12px ${item.color}35`
                      : undefined,
                  }}
                  className={`relative flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl transition-all duration-180 focus:outline-none cursor-pointer group min-h-[86px] sm:min-h-[96px] ${
                    isSelected
                      ? 'scale-[1.03]'
                      : 'bg-black/35 hover:bg-black/50 text-white/80 active:scale-95'
                  }`}
                >
                  {/* Icon */}
                  <div
                    style={{
                      filter: isSelected ? `drop-shadow(0 0 6px ${item.color})` : undefined,
                    }}
                    className={`flex items-center justify-center transition-transform ${
                      isSelected ? 'scale-110' : 'group-hover:scale-105'
                    }`}
                  >
                    {item.icon}
                  </div>

                  {/* Title */}
                  <div className="flex flex-col items-center mt-2 w-full">
                    <span className="text-white font-medium text-[11px] sm:text-xs text-center leading-tight whitespace-pre-line line-clamp-2">
                      {item.title}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Minimal Subtle Horizontal Scroll Line for Gestures Track */}
        {isScrollable && (
          <div className="w-full flex justify-center mt-3 pt-0.5">
            <div className="w-24 sm:w-28 h-1 bg-white/10 rounded-full relative overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-8 bg-white/45 rounded-full shadow-[0_0_6px_rgba(255,255,255,0.4)] transition-all duration-100 ease-out"
                style={{
                  left: `calc(${scrollProgress * 100}% - ${scrollProgress * 32}px)`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
