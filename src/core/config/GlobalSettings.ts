/**
 * Lokam Mini — GlobalSettings
 * Centralized settings configuration for graphics, performance, audio, controls, and accessibility.
 * All modules must query GlobalSettings rather than maintaining local toggles.
 */

export type GraphicsPreset = 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  preset: GraphicsPreset;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  viewDistance: number;
  vegetationDensity: 'low' | 'medium' | 'high';
  waterReflections: boolean;
  postProcessing: boolean;
  targetFps: number;
  showFps: boolean;
}

export interface AudioSettings {
  masterVolume: number;
  ambientVolume: number;
  sfxVolume: number;
  musicVolume: number;
  uiVolume: number;
  muted: boolean;
}

export interface ControlSettings {
  touchControls: boolean;
  touchSensitivity: number;
  mouseSensitivity: number;
  invertY: boolean;
  hapticFeedback: boolean;
}

export interface AccessibilitySettings {
  highContrastUi: boolean;
  fontSizeMultiplier: number;
  screenShake: boolean;
  reducedMotion: boolean;
}

export interface GlobalSettingsState {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  accessibility: AccessibilitySettings;
  isMobile: boolean;
}

const PRESET_GRAPHICS: Record<GraphicsPreset, Omit<GraphicsSettings, 'preset' | 'showFps'>> = {
  low: {
    pixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 512,
    antialias: false,
    viewDistance: 150,
    vegetationDensity: 'low',
    waterReflections: false,
    postProcessing: false,
    targetFps: 30,
  },
  medium: {
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    antialias: true,
    viewDistance: 300,
    vegetationDensity: 'medium',
    waterReflections: false,
    postProcessing: true,
    targetFps: 60,
  },
  high: {
    pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1.5, 2.0) : 1.5,
    shadows: true,
    shadowMapSize: 2048,
    antialias: true,
    viewDistance: 600,
    vegetationDensity: 'high',
    waterReflections: true,
    postProcessing: true,
    targetFps: 60,
  },
};

export class GlobalSettings {
  private state: GlobalSettingsState;
  private changeListeners: Array<(state: GlobalSettingsState) => void> = [];

  constructor() {
    const isMobile = this.detectMobile();
    const defaultPreset: GraphicsPreset = isMobile ? 'low' : 'high';

    this.state = {
      isMobile,
      graphics: {
        preset: defaultPreset,
        showFps: false,
        ...PRESET_GRAPHICS[defaultPreset],
      },
      audio: {
        masterVolume: 0.8,
        ambientVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.6,
        uiVolume: 0.7,
        muted: false,
      },
      controls: {
        touchControls: isMobile,
        touchSensitivity: 1.0,
        mouseSensitivity: 1.0,
        invertY: false,
        hapticFeedback: isMobile,
      },
      accessibility: {
        highContrastUi: false,
        fontSizeMultiplier: 1.0,
        screenShake: true,
        reducedMotion: false,
      },
    };
  }

  get current(): Readonly<GlobalSettingsState> {
    return this.state;
  }

  get graphics(): Readonly<GraphicsSettings> {
    return this.state.graphics;
  }

  get audio(): Readonly<AudioSettings> {
    return this.state.audio;
  }

  get controls(): Readonly<ControlSettings> {
    return this.state.controls;
  }

  get accessibility(): Readonly<AccessibilitySettings> {
    return this.state.accessibility;
  }

  setGraphicsPreset(preset: GraphicsPreset): void {
    const template = PRESET_GRAPHICS[preset];
    this.state.graphics = {
      ...this.state.graphics,
      preset,
      ...template,
    };
    this.notify();
  }

  updateGraphics(partial: Partial<GraphicsSettings>): void {
    this.state.graphics = { ...this.state.graphics, ...partial };
    this.notify();
  }

  updateAudio(partial: Partial<AudioSettings>): void {
    this.state.audio = { ...this.state.audio, ...partial };
    this.notify();
  }

  updateControls(partial: Partial<ControlSettings>): void {
    this.state.controls = { ...this.state.controls, ...partial };
    this.notify();
  }

  subscribe(listener: (state: GlobalSettingsState) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      const idx = this.changeListeners.indexOf(listener);
      if (idx !== -1) this.changeListeners.splice(idx, 1);
    };
  }

  private notify(): void {
    const snapshot = { ...this.state };
    for (const listener of this.changeListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[GlobalSettings] Error notifying listener:', err);
      }
    }
  }

  private detectMobile(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    return isTouch && (isMobileUa || window.innerWidth < 820);
  }
}
