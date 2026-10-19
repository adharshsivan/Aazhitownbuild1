import * as THREE from 'three';

export interface CharacterModule {
  playerMesh?: THREE.Object3D;
  getPosition?(): THREE.Vector3;
  getRotation?(): THREE.Euler | number;
  [key: string]: any;
}
