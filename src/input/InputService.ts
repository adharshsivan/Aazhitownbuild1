/**
 * Lokam Mini — InputService
 * Centralized, decoupled input service supporting Keyboard, Mouse, Touch/Virtual Stick, and Gamepad.
 * Gameplay modules read input state or listen to events without touching raw DOM listeners.
 */

import type { EventBus } from '../core/events/EventBus';

export interface InputVector {
  x: number; // -1 to 1 (strafe / steer)
  y: number; // -1 to 1 (forward / backward)
}

export interface InputLookVector {
  deltaX: number;
  deltaY: number;
}

export interface InputState {
  movement: InputVector;
  look: InputLookVector;
  jump: boolean;
  sprint: boolean;
  interact: boolean;
  crouch: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
}

export class InputService {
  private state: InputState = {
    movement: { x: 0, y: 0 },
    look: { deltaX: 0, deltaY: 0 },
    jump: false,
    sprint: false,
    interact: false,
    crouch: false,
    primaryAction: false,
    secondaryAction: false,
  };

  private keysDown = new Set<string>();
  private listeners: Array<() => void> = [];

  constructor(private eventBus?: EventBus) {
    this.bindWindowEvents();
  }

  get current(): Readonly<InputState> {
    return this.state;
  }

  /**
   * Set movement input vector programmatically (e.g. from mobile virtual joystick UI).
   */
  setVirtualMovement(x: number, y: number): void {
    this.state.movement.x = Math.max(-1, Math.min(1, x));
    this.state.movement.y = Math.max(-1, Math.min(1, y));
  }

  /**
   * Trigger an action button programmatically from mobile HUD.
   */
  setVirtualAction(action: 'jump' | 'interact' | 'sprint' | 'primaryAction', active: boolean): void {
    if (action in this.state) {
      this.state[action] = active;
    }
  }

  private bindWindowEvents(): void {
    if (typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      this.keysDown.add(e.code);
      this.updateKeyboardState();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
      this.updateKeyboardState();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.listeners.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  private updateKeyboardState(): void {
    let mx = 0;
    let my = 0;

    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) my += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) my -= 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) mx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) mx += 1;

    this.state.movement.x = mx;
    this.state.movement.y = my;
    this.state.jump = this.keysDown.has('Space');
    this.state.sprint = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    this.state.primaryAction = this.keysDown.has('KeyF');
    this.state.interact = this.keysDown.has('KeyE');
    this.state.crouch = this.keysDown.has('KeyC');
  }

  dispose(): void {
    for (const unbind of this.listeners) {
      unbind();
    }
    this.listeners = [];
    this.keysDown.clear();
  }
}
