/**
 * Lokam Mini — Strongly-Typed Event Bus System
 * Cross-module decoupling contracts.
 */

import type { GlobalSettingsState } from '../config/GlobalSettings';

export interface GameEventMap {
  // Engine & Lifecycle events
  'engine:ready': { timestamp: number };
  'engine:resized': { width: number; height: number; pixelRatio: number };
  'engine:paused': void;
  'engine:resumed': void;

  // World & Location events
  'world:ready': { locationId: string };
  'location:loading': { locationId: string; progress: number };
  'location:loaded': { locationId: string; name: string };
  'location:unloaded': { locationId: string };

  // Character & Player events
  'player:spawned': { playerId: string; position: [number, number, number] };
  'player:moved': { position: [number, number, number]; heading: number; cameraHeading?: number; isMoving?: boolean };
  'player:emote': { emoteId: string };
  'player:enteredVehicle': { playerId: string; vehicleId: string; seatIndex: number };
  'player:exitedVehicle': { playerId: string; vehicleId: string };
  'player:teleported': { position: [number, number, number] };

  // Vehicle events
  'vehicle:spawned': { vehicleId: string; type: string; position: [number, number, number] };
  'vehicle:destroyed': { vehicleId: string };

  // Gameplay & Interactions
  'interaction:available': { interactionId: string; label: string; promptKey: string };
  'interaction:unavailable': { interactionId: string };
  'interaction:started': { interactionId: string; type: string };
  'interaction:ended': { interactionId: string };

  // Interior transitions
  'interior:enter': { buildingId: string; interiorId: string };
  'interior:exit': { buildingId: string };

  // Settings & Quality
  'settings:changed': { key: keyof GlobalSettingsState; value: unknown; settings: GlobalSettingsState };

  // Multiplayer events
  'multiplayer:connected': { peerId: string; room: string };
  'multiplayer:disconnected': { reason: string };
  'multiplayer:playerJoined': { playerId: string; name: string; position: [number, number, number] };
  'multiplayer:playerLeft': { playerId: string };

  // Performance & Debug
  'perf:warning': { type: 'drawCalls' | 'fps' | 'memory'; value: number; threshold: number };
}

export type EventKey = keyof GameEventMap;
export type EventPayload<K extends EventKey> = GameEventMap[K];
export type EventCallback<K extends EventKey> = (payload: EventPayload<K>) => void;
export type UnsubscribeFn = () => void;
