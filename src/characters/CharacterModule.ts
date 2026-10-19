import type * as THREE from 'three';

export interface PlayerBridge {
  getPosition(): THREE.Vector3;
  getHeading(): number;
  triggerPunch(): void;
  triggerJump(): void;
  playEmote(emoteId: string): void;
  teleport(pos: [number, number, number]): void;
}

export interface CharacterModule {
  getPlayer(): PlayerBridge | null;
}
