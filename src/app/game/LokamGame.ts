import * as THREE from 'three';
import { EventBus } from '../../core/events/EventBus';
import { GlobalSettings, GraphicsPreset } from '../../core/config/GlobalSettings';
import { InputService } from '../../input/InputService';
import type { CharacterModule } from '../../characters/CharacterModule';

export interface LokamGame {
  readonly services: {
    input: InputService;
    eventBus: EventBus;
    settings: GlobalSettings;
    locations: {
      getActiveLocation(): { id: string; name: string };
    };
    get(name: string): any;
  };
  readonly lifecycle: {
    get(name: string): CharacterModule | undefined;
  };
  getEngine(): {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    toggleEnterExit?: () => void;
    toggleSit?: () => void;
    getInteractionState?: () => {
      isInside: boolean;
      inVehicle: boolean;
      inBuilding: boolean;
      isSitting: boolean;
    };
    cameraController: {
      setFPVMode(enabled: boolean): void;
      getIsFPV(): boolean;
      getForwardVector(): THREE.Vector3;
    };
  };
}

export function createAazhiLokamBridge(aazhi: any, inputService: InputService, eventBus: EventBus, settings: GlobalSettings): LokamGame {
  const charModule: CharacterModule = {
    getPlayer() {
      return aazhi.player || null;
    },
  };

  const skyServiceAdapter = {
    getState() {
      const p = aazhi.atmo?.info?.params || {};
      return {
        params: {
          rain: p.rain ?? 0,
          storm: p.storm ?? 0,
          fog: p.fog ?? 0,
          wind: p.wind ?? 0.3,
        },
        rain: {
          intensity: p.rain ?? 0,
        },
      };
    },
    getSnapshot() {
      return this.getState();
    },
    getRainCanvas() {
      return null;
    },
    getRainFX() {
      return null;
    },
  };

  // Sync settings changes to Aazhi engine & audio
  settings.subscribe((state) => {
    if (aazhi.atmo) {
      const presetMap: Record<GraphicsPreset, string> = {
        low: 'low',
        medium: 'medium',
        high: 'high',
      };
      const targetQ = presetMap[state.graphics.preset] || 'high';
      if (aazhi.atmo.quality !== targetQ) {
        aazhi.atmo.setQuality(targetQ);
      }
      if (aazhi.atmo.audio) {
        const shouldEnable = !state.audio.muted && state.audio.masterVolume > 0.01 && state.audio.sfxVolume > 0.01;
        aazhi.atmo.audio.setEnabled(shouldEnable);
      }
    }
    if (aazhi.controlsConfig) {
      aazhi.controlsConfig.sensitivity = state.controls.mouseSensitivity || 1.0;
      aazhi.controlsConfig.invertY = Boolean(state.controls.invertY);
    }
  });

  // Listen to HUD events (emotes, teleports, interactions)
  eventBus.on('player:emote', ({ emoteId }) => {
    if (aazhi.mode !== 'explore') {
      aazhi.setMode('explore');
    }
    aazhi.player?.playEmote?.(emoteId);
  });

  eventBus.on('player:teleported', ({ position }) => {
    if (aazhi.mode !== 'explore') {
      aazhi.setMode('explore');
    }
    aazhi.teleportPlayer?.(position[0], position[2]);
  });

  eventBus.on('interaction:started', ({ interactionId }) => {
    if (interactionId === 'sit_chair' || interactionId === 'stand_up') {
      aazhi.toggleSit?.();
      return;
    }
    if (interactionId === 'enter_exit') {
      aazhi.toggleEnterExit?.();
      return;
    }
    if (interactionId === 'cafe_enter' || interactionId === 'shop_enter') {
      aazhi.enterTeaShop?.(interactionId);
      return;
    }
    if (interactionId === 'cafe_exit' || interactionId === 'shop_exit') {
      aazhi.exitTeaShop?.(interactionId);
      return;
    }
    if (aazhi.mode !== 'explore') {
      aazhi.setMode('explore');
    }
    if (aazhi.trafficLights) {
      for (const p of aazhi.trafficLights.poles) {
        if (p.pos.distanceTo(aazhi.player.pos) < 6.0) {
          aazhi.trafficLights.requestPedestrianWalk();
          break;
        }
      }
    }
  });

  return {
    services: {
      input: inputService,
      eventBus,
      settings,
      locations: {
        getActiveLocation() {
          return { id: 'kochi-island', name: 'Aazhi Waterfront' };
        },
      },
      get(name: string) {
        if (name === 'sky') return skyServiceAdapter;
        if (name === 'input') return inputService;
        if (name === 'eventBus') return eventBus;
        if (name === 'settings') return settings;
        return null;
      },
    },
    lifecycle: {
      get(name: string) {
        if (name === 'character') return charModule;
        return undefined;
      },
    },
    getEngine() {
      return {
        renderer: aazhi.renderer,
        scene: aazhi.scene,
        camera: aazhi.camera,
        toggleEnterExit() {
          aazhi.toggleEnterExit?.();
        },
        toggleSit() {
          aazhi.toggleSit?.();
        },
        getInteractionState() {
          if (aazhi.getInteractionState) {
            return aazhi.getInteractionState();
          }
          return { isInside: false, inVehicle: false, inBuilding: false, isSitting: false };
        },
        cameraController: {
          setFPVMode(enabled: boolean) {
            aazhi.setFPVMode?.(enabled);
          },
          getIsFPV() {
            return Boolean(aazhi.getFPVMode?.());
          },
          getForwardVector() {
            const forward = new THREE.Vector3();
            aazhi.camera.getWorldDirection(forward);
            forward.y = 0;
            if (forward.lengthSq() > 1e-6) forward.normalize();
            else forward.set(0, 0, -1);
            return forward;
          },
        },
      };
    },
  };
}
