/**
 * Lokam Mini — Master Game HUD
 * Neatly coordinates all mobile landscape HUD components:
 * Top-left profile, top-right currency/menu & minimap, bottom-left joystick,
 * bottom-center action dock, and bottom-right action buttons.
 * Features fluid cubic-bezier animations when switching between gameplay HUD, Camera Mode,
 * and the 8-station Radial Radio Wheel.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { LokamGame } from '../../app/game/LokamGame';
import { PlayerProfileBadge } from './PlayerProfileBadge';
import { Minimap } from './Minimap';
import { VirtualJoystick } from './VirtualJoystick';
import { BottomActionTray } from './BottomActionTray';
import { FistButton } from './FistButton';
import { JumpButton } from './JumpButton';
import { BagButton } from './BagButton';
import { InteractionPrompt, InteractionPromptData } from './InteractionPrompt';
import { GameSettingsModal } from './GameSettingsModal';
import { WebControlsPlaceholder } from './WebControlsPlaceholder';
import { CameraModeOverlay } from './CameraModeOverlay';
import { RadioWheelOverlay, STATIONS, StationItem } from './RadioWheelOverlay';
import { RadioStationsModal, CATALOG_STATIONS } from './RadioStationsModal';
import { radioAudioService } from '../../services/radio/RadioAudioService';
import { ChatModal } from './ChatModal';
import { ActivityDockPopup, ActivityPopupType, ActivityItem } from './ActivityDockPopup';
import { InventoryModal } from './InventoryModal';
import { FriendsModal } from './FriendsModal';

interface GameHUDProps {
  game: LokamGame | null;
}

export const GameHUD: React.FC<GameHUDProps> = ({ game }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [radioWheelOpen, setRadioWheelOpen] = useState(false);
  const [stationsModalOpen, setStationsModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [dockPopup, setDockPopup] = useState<ActivityPopupType | null>(null);
  const [lastDockPopupType, setLastDockPopupType] = useState<ActivityPopupType>('games');
  const [activeGesture, setActiveGesture] = useState<ActivityItem | null>(null);
  const gestureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [activeStationId, setActiveStationId] = useState('sooriyan_fm');
  const [isInsideState, setIsInsideState] = useState(false);
  const [activePrompt, setActivePrompt] = useState<InteractionPromptData | null>(null);
  const promptContainerRef = useRef<HTMLDivElement | null>(null);

  // Synchronize Camera Mode with FPV Camera Controller
  useEffect(() => {
    game?.getEngine().cameraController.setFPVMode(cameraMode);
  }, [cameraMode, game]);

  // Project 3D chair anchor inside the Tea Shop for the "Sit on Chair" / "Stand Up" action prompt
  useEffect(() => {
    if (!game) return;
    let rafId = 0;
    const tempVec = new THREE.Vector3();

    const CAFE_CHAIRS = [
      new THREE.Vector3(48.42, 2.48, 5.6),
      new THREE.Vector3(49.98, 2.48, 5.6),
      new THREE.Vector3(46.22, 2.48, 8.5),
      new THREE.Vector3(47.78, 2.48, 8.5),
      new THREE.Vector3(47.42, 2.48, 1.85),
      new THREE.Vector3(48.98, 2.48, 1.85),
    ];

    const SHOP_CHAIRS = [
      new THREE.Vector3(-32.13, 2.48, 15.65),
      new THREE.Vector3(-30.57, 2.48, 15.65),
    ];

    const updateHudLoop = () => {
      const engine = game.getEngine();
      const camera = engine?.camera;
      const charMod = game.lifecycle.get('character') as any;
      const player = charMod?.getPlayer();
      const iState = engine?.getInteractionState
        ? engine.getInteractionState()
        : { isInside: false, inVehicle: false, inBuilding: false, isSitting: false };

      setIsInsideState((prev) => (prev === iState.isInside ? prev : iState.isInside));

      if (!iState.inBuilding || iState.inVehicle || !camera || !player) {
        setActivePrompt((prev) => (prev === null ? null : null));
      } else {
        const pPos = player.getPosition();
        const insideShop = pPos.x < 0;
        const chairs = insideShop ? SHOP_CHAIRS : CAFE_CHAIRS;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;

        let bestScreen: { x: number; y: number; dist: number } | null = null;
        for (const c of chairs) {
          tempVec.copy(c).project(camera);
          if (tempVec.z <= 0 || tempVec.z >= 1) continue;
          const sx = (tempVec.x * 0.5 + 0.5) * vw;
          const sy = (-tempVec.y * 0.5 + 0.5) * vh;
          if (sx < 40 || sx > vw - 40 || sy < 40 || sy > vh - 40) continue;
          const d = Math.hypot(c.x - pPos.x, c.z - pPos.z);
          if (!bestScreen || d < bestScreen.dist) {
            bestScreen = { x: sx, y: sy, dist: d };
          }
        }

        if (bestScreen) {
          const wantId = iState.isSitting ? 'stand_up' : 'sit_chair';
          const wantLabel = iState.isSitting ? 'Stand Up' : 'Sit on Chair';
          setActivePrompt((prev) => {
            if (prev && prev.id === wantId) return prev;
            return {
              id: wantId,
              label: wantLabel,
              type: 'seating',
            };
          });

          if (promptContainerRef.current) {
            promptContainerRef.current.style.opacity = '1';
            promptContainerRef.current.style.transform = `translate3d(${Math.round(bestScreen.x)}px, ${Math.round(bestScreen.y)}px, 0) translate(-50%, -100%)`;
          }
        } else {
          if (promptContainerRef.current) {
            promptContainerRef.current.style.opacity = '0';
          }
        }
      }

      rafId = requestAnimationFrame(updateHudLoop);
    };

    rafId = requestAnimationFrame(updateHudLoop);
    return () => cancelAnimationFrame(rafId);
  }, [game]);

  useEffect(() => {
    return () => {
      if (gestureTimerRef.current) {
        clearTimeout(gestureTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (dockPopup) {
      setLastDockPopupType(dockPopup);
    }
  }, [dockPopup]);
  const [wheelStationIds, setWheelStationIds] = useState<string[]>(() => STATIONS.map((s) => s.id));

  // Sync state with Radio Audio Service
  useEffect(() => {
    const unsubscribe = radioAudioService.subscribe((state) => {
      setActiveStationId(state.activeStationId);
    });
    return unsubscribe;
  }, []);

  const inputService = game?.services.input;
  const activeLocation = game?.services.locations.getActiveLocation();
  const locationName = activeLocation?.name || 'Aazhi Waterfront';

  // Compute custom wheel stations with 8 radial 45° sectors and streaming URLs
  const customWheelStations: StationItem[] = useMemo(() => {
    return Array.from({ length: 8 }, (_, index) => {
      const id = wheelStationIds[index];
      // Slot 0 (the top power slot) when off or undefined is the master power switch NO STATION / OFF
      if (index === 0 && (!id || id === 'off')) {
        return {
          id: 'off',
          name: 'NO STATION',
          freq: 'OFF',
          angleDeg: 0,
          iconType: 'power',
          colorHex: '#ffffff',
          streamUrl: '',
          isEmpty: true,
        };
      }

      // Any other unconfigured or empty slot shows as EMPTY SLOT with the empty icon
      if (!id || id === 'off' || id.startsWith('empty_')) {
        return {
          id: `empty_${index}`,
          name: 'EMPTY SLOT',
          freq: 'EMPTY',
          angleDeg: index * 45,
          iconType: 'empty',
          colorHex: '#ffffff',
          streamUrl: '',
          isEmpty: true,
        };
      }
      const catalogItem = CATALOG_STATIONS.find((c) => c.id === id);
      const defaultItem = STATIONS.find((s) => s.id === id);
      return {
        id,
        name: catalogItem?.name || defaultItem?.name || id.toUpperCase(),
        freq: catalogItem?.freq || defaultItem?.freq || 'FM',
        angleDeg: index * 45,
        iconType: catalogItem?.iconType || defaultItem?.iconType || 'radio',
        colorHex: catalogItem?.colorHex || defaultItem?.colorHex || '#ffffff',
        streamUrl: catalogItem?.streamUrl || defaultItem?.streamUrl || '',
        language: (catalogItem?.language?.toLowerCase() as 'malayalam' | 'tamil' | 'english') || defaultItem?.language,
      };
    });
  }, [wheelStationIds]);

  const currentPlayingStation =
    CATALOG_STATIONS.find((s) => s.id === activeStationId) ||
    STATIONS.find((s) => s.id === activeStationId);

  const handleActionTrigger = (actionName: string) => {
    if (actionName === 'camera') {
      setCameraMode(true);
      setDockPopup(null);
    } else if (actionName === 'radio') {
      setRadioWheelOpen((prev) => !prev);
      setDockPopup(null);
    } else if (actionName === 'chat') {
      setChatOpen((prev) => !prev);
      setDockPopup(null);
    } else if (actionName === 'fullscreen') {
      setDockPopup(null);
    } else if (actionName === 'games') {
      setDockPopup((prev) => (prev === 'games' ? null : 'games'));
    } else if (actionName === 'city') {
      setDockPopup((prev) => (prev === 'city' ? null : 'city'));
    } else if (actionName === 'gestures' || actionName === 'gesture') {
      setDockPopup((prev) => (prev === 'gestures' ? null : 'gestures'));
    } else if (actionName === 'friends') {
      setFriendsOpen((prev) => !prev);
      setDockPopup(null);
    } else if (actionName === 'bag' || actionName === 'backpack') {
      setInventoryOpen((prev) => !prev);
      setDockPopup(null);
    }
  };

  const handleMiniGameSelect = (item: ActivityItem) => {
    const coords: Record<string, [number, number, number]> = {
      cycling_race: [0, 0.4, 25],
      fishing: [-5, 0.4, -25],
      delivery_run: [3, 0.4, -10],
      boat_race: [-6, 0.4, 40],
      parkour: [2, 0.4, 5],
    };
    const target = coords[item.id] || [0, 0.4, 10];
    game?.services.eventBus.emit('player:teleported', { position: target });
  };

  const handleCityPlaceSelect = (item: ActivityItem) => {
    const coords: Record<string, [number, number, number]> = {
      sarvam_theater: [4, 0.4, 30],
      heritage_museum: [-3, 0.4, -20],
      aazhi_stadium: [0, 0.4, 50],
      cafe_rooftop: [39.5, 1.75, 3.0],
      paradise_mall: [-2, 0.4, 15],
    };
    const target = coords[item.id] || [0, 0.4, 10];
    game?.services.eventBus.emit('player:teleported', { position: target });
  };

  const handleInteraction = (id: string) => {
    game?.services.eventBus.emit('interaction:started', {
      interactionId: id,
      type: 'tea',
    });
  };

  return (
    <>
      {/* ── STANDARD GAMEPLAY HUD LAYER ── */}
      <div
        className="absolute inset-0 z-30 pointer-events-none select-none flex flex-col justify-between p-3 sm:p-5 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] overflow-hidden"
      >
        {/* ── TOP HUD LAYER (Slides Up on Camera Mode) ── */}
        <div
          className={`flex items-start justify-between w-full transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            cameraMode ? '-translate-y-6 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
          }`}
        >
          {/* Top-Left: Circular Radar Minimap */}
          <div className="flex flex-col items-start">
            <Minimap
              game={game}
              inputService={inputService}
              locationTitle={locationName}
            />
          </div>

          {/* Top-Right: Player Profile Avatar (Opens Game Settings Menu) */}
          <div className="flex items-center pointer-events-auto">
            <PlayerProfileBadge onClick={() => setSettingsOpen(true)} />
          </div>
        </div>

        {/* ── MIDDLE GROUND: Action Prompt Positioned Cleanly Above Player ── */}
        <div
          className={`transition-opacity duration-200 ${
            cameraMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <InteractionPrompt
            prompt={activePrompt}
            containerRef={promptContainerRef}
            onInteract={handleInteraction}
          />
        </div>

        {/* ── BOTTOM HUD LAYER ── */}
        <div className="flex items-end justify-between w-full">
          {/* Bottom-Left: Virtual Joystick D-Pad (Remains accessible in FPV Camera Mode with soft opacity) */}
          <div
            className={`flex flex-col items-start space-y-2 pointer-events-auto transition-opacity duration-300 ${
              cameraMode ? 'opacity-50 hover:opacity-100' : 'opacity-100'
            }`}
          >
            <VirtualJoystick inputService={inputService} size={146} />
            {/* Subtle indicator for desktop users */}
            <WebControlsPlaceholder showHint={false} />
          </div>

          {/* Bottom-Center: Collapsible Utility Dock (Slides Down on Camera Mode) */}
          <div
            className={`relative mb-1 z-50 flex flex-col items-center transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              cameraMode ? 'translate-y-12 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            {/* Minimal Activity, Gestures & City Dock Popup (Matches Standard Monochrome HUD) */}
            <ActivityDockPopup
              type={dockPopup || lastDockPopupType}
              isOpen={Boolean(dockPopup)}
              onClose={() => setDockPopup(null)}
              onSelectItem={(item) => {
                const currentType = dockPopup || lastDockPopupType;
                if (currentType === 'gestures') {
                  setActiveGesture(item);
                  if (gestureTimerRef.current) {
                    clearTimeout(gestureTimerRef.current);
                  }
                  gestureTimerRef.current = setTimeout(() => {
                    setActiveGesture(null);
                  }, 5000);
                  try {
                    game?.services.eventBus.emit('player:emote', { emoteId: item.id });
                  } catch (e) {
                    console.debug('Emote event:', item.id);
                  }
                } else if (currentType === 'games') {
                  handleMiniGameSelect(item);
                } else if (currentType === 'city') {
                  handleCityPlaceSelect(item);
                }
              }}
            />

            <BottomActionTray
              onActionTrigger={handleActionTrigger}
              radioActive={activeStationId !== 'off'}
              radioColor={activeStationId !== 'off' ? currentPlayingStation?.colorHex : undefined}
              activeStationName={activeStationId !== 'off' ? currentPlayingStation?.name : undefined}
              activeDockItem={dockPopup || undefined}
              activeGesture={activeGesture}
            />
          </div>

          {/* Bottom-Right Action Buttons: Stacked Vertically (Fist -> Jump -> Enter/Exit) (Slides Down on Camera Mode) */}
          <div
            className={`flex flex-col items-center space-y-3 mb-2 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              cameraMode ? 'translate-y-12 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            {/* 1. Fist (Top) */}
            <FistButton
              inputService={inputService}
              size={58}
              onPunch={() => {
                try {
                  const charModule = game?.lifecycle.get('character') as any;
                  charModule?.getPlayer()?.triggerPunch();
                } catch {}
              }}
            />
            {/* 2. Jump (Middle) */}
            <JumpButton
              inputService={inputService}
              size={58}
              onJump={() => {
                if (inputService) {
                  inputService.setVirtualAction('jump', true);
                }
              }}
            />
            {/* 3. Enter / Exit Car or Building (Bottom) */}
            <BagButton
              size={58}
              isInside={isInsideState}
              onOpenBag={() => {
                game?.getEngine().toggleEnterExit?.();
              }}
            />
          </div>
        </div>
      </div>

      {/* ── FULL-SCREEN CAMERA / PHOTO MODE OVERLAY ── */}
      <CameraModeOverlay
        isOpen={cameraMode}
        onClose={() => setCameraMode(false)}
        game={game}
      />

      {/* ── INTERACTIVE 8-STATION RADIAL RADIO WHEEL (Neutral Smoked Glass) ── */}
      <RadioWheelOverlay
        isOpen={radioWheelOpen}
        onClose={() => setRadioWheelOpen(false)}
        activeStationId={activeStationId}
        onSelectStation={(id) => setActiveStationId(id)}
        onOpenStationsModal={() => {
          setRadioWheelOpen(false);
          setStationsModalOpen(true);
        }}
        customStations={customWheelStations}
      />

      {/* ── TROPICAL RADIO STATIONS SELECTOR & CONFIGURATION MODAL ── */}
      <RadioStationsModal
        isOpen={stationsModalOpen}
        onClose={() => setStationsModalOpen(false)}
        activeStationId={activeStationId}
        onPlayStation={(id, streamUrl, stationName) => {
          if (id === 'off') {
            radioAudioService.stop();
            setActiveStationId('off');
          } else {
            radioAudioService.playStation(id, streamUrl, stationName);
            setActiveStationId(id);
          }
        }}
        wheelStationIds={wheelStationIds}
        onApplyWheelStations={(newIds) => setWheelStationIds(newIds)}
      />

      {/* ── IN-GAME WORLD CHAT BOX ── */}
      <ChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      {/* ── NEON SEASIDE GAME SETTINGS MENU MODAL ── */}
      <GameSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        game={game}
      />

      {/* ── ISLAND BACKPACK & INVENTORY MODAL ── */}
      <InventoryModal
        isOpen={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
      />

      {/* ── FRIENDS & SOCIAL PARTY MODAL ── */}
      <FriendsModal
        isOpen={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        onTeleportToFriend={() => {
          game?.services.eventBus.emit('player:teleported', { position: [0, 0.4, 12] });
          setFriendsOpen(false);
        }}
      />
    </>
  );
};
