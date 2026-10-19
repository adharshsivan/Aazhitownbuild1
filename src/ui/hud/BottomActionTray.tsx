/**
 * Lokam Mini — Bottom Action Tray (Bottom-Center HUD)
 * Completely Rounded Design (100% circular / rounded-full, zero rectangles):
 * - Collapsible toggle is an integrated round button inside the rounded-full action bar.
 * - In mobile, it provides a generous, effortless 44px+ circular touch target.
 * - Fluid 300ms cubic-bezier transitions for expanding and collapsing.
 * - When collapsed: cleanly collapses into a single perfectly round circular glass puck.
 * - When expanded: beautifully unfurls into a balanced smoked glass pill with 8 action discs + toggle button.
 * - Exact Icon Sequence (Left to Right):
 *   1. Mic (Voice Chat)
 *   2. Gestures (Emotes)
 *   3. Radio (Broadcast)
 *   4. Camera (Photo Mode)
 *   5. Games (Island Mini-Games)
 *   6. Building (Fort Kochi City / Bazaar)
 *   7. Friends (Social / Party)
 *   8. Chat (In-Game World Chat)
 *   9. Collapse/Expand Toggle
 */

import React, { useState, useEffect } from 'react';
import {
  Camera,
  Maximize2,
  Minimize2,
  Building2,
  Users,
  MessageSquare,
  Radio,
  Mic,
  MicOff,
  ChevronDown,
} from 'lucide-react';
import { MdEmojiPeople } from 'react-icons/md';

interface ActiveGestureData {
  id: string;
  title: string;
  color: string;
  icon: React.ReactNode;
}

interface BottomActionTrayProps {
  onActionTrigger?: (actionName: string) => void;
  radioActive?: boolean;
  radioColor?: string;
  activeStationName?: string;
  activeDockItem?: string;
  activeGesture?: ActiveGestureData | null;
}

export const BottomActionTray: React.FC<BottomActionTrayProps> = ({
  onActionTrigger,
  radioActive: controlledRadioActive,
  radioColor,
  activeStationName,
  activeDockItem,
  activeGesture,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [micActive, setMicActive] = useState(false);
  const [internalRadioActive, setInternalRadioActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const radioActive = controlledRadioActive !== undefined ? controlledRadioActive : internalRadioActive;

  useEffect(() => {
    const syncFullscreen = () => {
      const doc = document as any;
      const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
      const pseudoFs = document.documentElement.classList.contains('aazhi-fullscreen');
      setIsFullscreen(Boolean(fsEl || pseudoFs));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  const toggleFullscreen = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const doc = document as any;
    const el = document.documentElement as any;
    const isNativeFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
    const isPseudoFs = el.classList.contains('aazhi-fullscreen');

    if (isNativeFs || isPseudoFs) {
      if (isNativeFs) {
        const exitFn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
        if (exitFn) {
          Promise.resolve(exitFn.call(doc)).catch(() => {});
        }
      }
      el.classList.remove('aazhi-fullscreen');
      setIsFullscreen(false);
      window.dispatchEvent(new Event('resize'));
    } else {
      const reqFn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (reqFn) {
        Promise.resolve(reqFn.call(el, { navigationUI: 'hide' }))
          .then(() => {
            setIsFullscreen(true);
            try {
              (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => {});
            } catch {}
          })
          .catch(() => {
            // Fallback for iOS Safari / restricted mobile webviews
            el.classList.add('aazhi-fullscreen');
            setIsFullscreen(true);
            window.scrollTo(0, 1);
            window.dispatchEvent(new Event('resize'));
          });
      } else {
        el.classList.add('aazhi-fullscreen');
        setIsFullscreen(true);
        window.scrollTo(0, 1);
        window.dispatchEvent(new Event('resize'));
      }
    }
    onActionTrigger?.('fullscreen');
  };

  const handleAction = (name: string, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (name === 'mic') {
      setMicActive((prev) => !prev);
    } else if (name === 'radio') {
      setInternalRadioActive((prev) => !prev);
    }

    onActionTrigger?.(name);
  };

  return (
    <div className="relative z-40 select-none pointer-events-auto flex flex-col items-center">
      {/* Purely Rounded Action Bar Capsule (100% Rounded, Zero Rectangles) */}
      <div
        className={`flex items-center rounded-full bg-black/35 hover:bg-black/45 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? 'px-3 py-2' : 'p-1.5 bg-black/45 hover:bg-black/60 shadow-[0_6px_20px_rgba(0,0,0,0.4)]'
        }`}
      >
        {/* Animated Tray of Action Discs (Expands/Collapses horizontally with fluid easing) */}
        <div
          className={`flex items-center space-x-1.5 sm:space-x-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-right ${
            isOpen
              ? 'max-w-[580px] opacity-100 scale-100 mr-1.5 sm:mr-2 overflow-visible'
              : 'max-w-0 opacity-0 scale-90 mr-0 pointer-events-none overflow-hidden'
          }`}
        >
          {/* 1. Mic / Voice Chat */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            {micActive && (
              <span className="absolute -inset-0.5 rounded-full bg-rose-500/15 pointer-events-none animate-small-ring-pulse z-0" />
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('mic', e)}
              title={micActive ? 'Mute Mic' : 'Unmute Mic'}
              aria-label={micActive ? 'Mute Mic' : 'Unmute Mic'}
              className={`relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all focus:outline-none cursor-pointer active:scale-95 ${
                micActive
                  ? 'bg-[#e11d48] text-white shadow-[0_0_18px_rgba(225,29,72,0.55)]'
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md'
              }`}
            >
              {micActive ? (
                <Mic className="w-5 h-5 stroke-[2] drop-shadow-sm" />
              ) : (
                <MicOff className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
              )}
            </button>
          </div>

          {/* 2. Gesture / Emote */}
          <div className="relative flex items-center justify-center flex-shrink-0 rounded-full">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('gestures', e)}
              title={activeGesture ? `Playing: ${activeGesture.title.replace('\n', ' ')}` : 'Gestures & Emotes'}
              aria-label={activeGesture ? `Playing: ${activeGesture.title.replace('\n', ' ')}` : 'Gestures and Emotes'}
              style={{
                backgroundColor: activeGesture ? activeGesture.color : undefined,
                boxShadow: activeGesture ? `0 0 16px ${activeGesture.color}88` : undefined,
              }}
              className={`relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none cursor-pointer active:scale-95 ${
                activeGesture
                  ? 'text-white'
                  : activeDockItem === 'gestures'
                  ? 'bg-white/25 text-white shadow-[0_0_16px_rgba(255,255,255,0.35)]'
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md'
              }`}
            >
              {/* 5-second circular white animated loader ring directly on the button's exact perimeter */}
              {activeGesture && (
                <svg
                  key={`loader-${activeGesture.id}`}
                  className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none rounded-full"
                  viewBox="0 0 44 44"
                >
                  {/* Subtle base track */}
                  <circle
                    cx="22"
                    cy="22"
                    r="20.5"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.3)"
                    strokeWidth="2.5"
                  />
                  {/* Pure white animated loader ring (Clean vector, zero raster square artifacts) */}
                  <circle
                    cx="22"
                    cy="22"
                    r="20.5"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeDasharray="128.8"
                    strokeDashoffset="128.8"
                    strokeLinecap="round"
                    className="animate-gesture-loader"
                  />
                </svg>
              )}

              {activeGesture ? (
                <div
                  key={`icon-${activeGesture.id}`}
                  className="w-5.5 h-5.5 flex items-center justify-center text-white drop-shadow-sm animate-in zoom-in-75 duration-200"
                >
                  {activeGesture.icon}
                </div>
              ) : (
                <MdEmojiPeople className="w-5.5 h-5.5 text-white drop-shadow-sm transition-all duration-200" />
              )}
            </button>
          </div>

          {/* 3. Radio / Broadcast */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            {radioActive && (
              <span
                style={{
                  backgroundColor: radioColor ? `${radioColor}22` : 'rgba(132, 204, 22, 0.15)',
                }}
                className="absolute -inset-0.5 rounded-full pointer-events-none animate-small-ring-pulse z-0 transition-colors duration-300"
              />
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('radio', e)}
              title={activeStationName ? `Radio: ${activeStationName}` : 'Radio Broadcast'}
              aria-label="Radio Broadcast"
              style={{
                backgroundColor: radioActive ? (radioColor || '#84cc16') : undefined,
                boxShadow: radioActive
                  ? `0 0 18px ${radioColor ? `${radioColor}88` : 'rgba(132,204,22,0.6)'}`
                  : undefined,
                color: radioActive ? '#000000' : '#ffffff',
              }}
              className={`relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none cursor-pointer active:scale-95 ${
                radioActive
                  ? ''
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md'
              }`}
            >
              <Radio className="w-5 h-5 stroke-[2.2] drop-shadow-sm" />
            </button>
          </div>

          {/* 4. Camera / Photo Mode */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('camera', e)}
              title="Photo Mode"
              aria-label="Photo Mode"
              className="relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/55 active:scale-95 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md flex items-center justify-center transition-all focus:outline-none cursor-pointer"
            >
              <Camera className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
            </button>
          </div>

          {/* 5. Maximize / Fullscreen (Phone & Desktop) */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Maximize Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Maximize Fullscreen'}
              className={`relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all focus:outline-none cursor-pointer active:scale-95 ${
                isFullscreen
                  ? 'bg-white/25 text-white shadow-[0_0_16px_rgba(255,255,255,0.35)]'
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md'
              }`}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
              ) : (
                <Maximize2 className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
              )}
            </button>
          </div>

          {/* 6. Buildings / Fort Kochi City & Bazaar */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('city', e)}
              title="Fort Kochi City"
              aria-label="Fort Kochi City"
              className={`relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all focus:outline-none cursor-pointer active:scale-95 ${
                activeDockItem === 'city'
                  ? 'bg-white/25 text-white shadow-[0_0_16px_rgba(255,255,255,0.35)]'
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md'
              }`}
            >
              <Building2 className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
            </button>
          </div>

          {/* 7. Friends / Social Hub */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('friends', e)}
              title="Friends & Party"
              aria-label="Friends and Party"
              className="relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/55 active:scale-95 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md flex items-center justify-center transition-all focus:outline-none cursor-pointer"
            >
              <Users className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
            </button>
          </div>

          {/* 8. Chat Button (After Friends) */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleAction('chat', e)}
              title="World Chat"
              aria-label="World Chat"
              className="relative z-10 pointer-events-auto w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/55 active:scale-95 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md flex items-center justify-center transition-all focus:outline-none cursor-pointer"
            >
              <MessageSquare className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
            </button>
          </div>
        </div>

        {/* Integrated Round Collapse/Expand Toggle Button (100% Circular, Zero Rectangles) */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          aria-label={isOpen ? 'Collapse Actions' : 'Expand Actions'}
          title={isOpen ? 'Collapse Actions' : 'Expand Actions'}
          className={`flex-shrink-0 w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-300 ease-out focus:outline-none cursor-pointer active:scale-90 ${
            isOpen
              ? 'bg-black/40 hover:bg-black/55 text-white/80 hover:text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]'
              : 'bg-black/50 hover:bg-black/65 text-white shadow-[0_0_14px_rgba(255,255,255,0.25)]'
          }`}
        >
          <ChevronDown
            className={`w-5 h-5 stroke-[2.2] drop-shadow-sm transform transition-transform duration-300 ease-out ${
              isOpen ? 'rotate-0' : 'rotate-180'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
