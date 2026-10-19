/**
 * Lokam Mini — In-Game Photo & Video Camera Mode Overlay
 * Features:
 * - Fluid 350ms cubic-bezier transition for entering and exiting camera mode.
 * - Viewfinder with 4 corner brackets and center focus reticle.
 * - Toggleable rule-of-thirds grid (1-tap toggle).
 * - Instant 1-tap Filter toggle.
 * - Tap to take photo (with canvas capture, shutter flash, and save to gallery).
 * - Long press (hold for >400ms) to record video (with canvas captureStream, MediaRecorder, live timer, and save to gallery).
 * - Tap again or release to stop recording.
 * - Latest photo/video thumbnail badge in gallery button.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Image as ImageIcon, Grid3X3, X, Sparkles, CloudRain } from 'lucide-react';
import { CameraGalleryModal, GalleryItem } from './CameraGalleryModal';
import { CAMERA_FILTERS, CameraFilter, renderWeatherAtmosphere } from './cameraFilters';
import type { LokamGame } from '../../app/game/LokamGame';

interface CameraModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  game?: LokamGame | null;
}

export const CameraModeOverlay: React.FC<CameraModeOverlayProps> = ({
  isOpen,
  onClose,
  game,
}) => {
  const [showGrid, setShowGrid] = useState(true);
  const [activeFilterId, setActiveFilterId] = useState<string>('normal');
  const [showFilterPicker, setShowFilterPicker] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPressing, setIsPressing] = useState(false);

  // User snapshots state with localStorage cache
  const [userSnapshots, setUserSnapshots] = useState<GalleryItem[]>(() => {
    try {
      const saved = localStorage.getItem('lokam_mini_user_snapshots');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Refs for recording & long press
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pressStartTimeRef = useRef<number>(0);
  const hasTriggeredLongPressRef = useRef<boolean>(false);
  const videoThumbnailRef = useRef<string>('');

  // Persist snapshots to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('lokam_mini_user_snapshots', JSON.stringify(userSnapshots));
    } catch {}
  }, [userSnapshots]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const activeFilter: CameraFilter =
    CAMERA_FILTERS.find((f) => f.id === activeFilterId) || CAMERA_FILTERS[0];

  // Helper: Query active weather parameters from game services
  const queryWeatherState = useCallback(() => {
    try {
      const skyService = (game?.services?.get?.('sky') as any);
      const skyState = skyService?.getState?.() || skyService?.getSnapshot?.();
      const rainIntensity =
        skyState?.rain?.intensity ??
        skyState?.params?.rain ??
        (skyService?.rainControls?.enabled ? skyService.rainControls.intensity : 0) ??
        0;
      const stormIntensity = skyState?.params?.storm ?? 0;
      const fogIntensity = skyState?.params?.fog ?? 0;
      const windSpeed = skyState?.params?.wind ?? 0.3;
      return { rain: rainIntensity, storm: stormIntensity, fog: fogIntensity, windSpeed };
    } catch {
      return { rain: 0, storm: 0, fog: 0, windSpeed: 0.3 };
    }
  }, [game]);

  // Helper: Capture composite frame containing 3D scene + RainFX canvas + weather droplets/mist + camera filter
  const captureCompositeFrame = useCallback((): string | null => {
    try {
      if (game) {
        try {
          const engine = game.getEngine();
          engine.renderer.render(engine.scene, engine.camera);
        } catch {}
      }

      // 1. Locate main 3D WebGL canvas
      const allCanvases = Array.from(document.querySelectorAll('canvas'));
      const mainCanvas =
        allCanvases.find(
          (c) => c.classList.contains('touch-none') || c.tabIndex === 0
        ) || allCanvases[0];

      if (!mainCanvas) return null;

      // 2. Locate RainFX canvas and trigger its render pass if active
      const skyService = (game?.services?.get?.('sky') as any);
      const rainCanvas =
        skyService?.getRainCanvas?.() ||
        allCanvases.find((c) => c !== mainCanvas && c.style.pointerEvents === 'none');

      if (skyService?.getRainFX?.()) {
        try {
          const engine = game?.getEngine?.();
          if (engine?.camera) {
            skyService.getRainFX().render(engine.camera);
          }
        } catch {}
      }

      // 3. Create high-resolution output canvas
      const output = document.createElement('canvas');
      output.width = mainCanvas.width || mainCanvas.clientWidth || 1920;
      output.height = mainCanvas.height || mainCanvas.clientHeight || 1080;
      const ctx = output.getContext('2d');
      if (!ctx) return mainCanvas.toDataURL('image/jpeg', 0.92);

      // 4. Draw base 3D scene with camera filter applied
      if (activeFilter.canvasFilter && activeFilter.canvasFilter !== 'none') {
        ctx.filter = activeFilter.canvasFilter;
      }
      ctx.drawImage(mainCanvas, 0, 0, output.width, output.height);
      ctx.filter = 'none';

      // 5. Draw RainFX 3D particle streaks & ground ripples canvas
      if (rainCanvas && rainCanvas.width > 0 && rainCanvas.height > 0) {
        ctx.drawImage(rainCanvas, 0, 0, output.width, output.height);
      }

      // 6. Draw realistic weather atmosphere, mist, and lens water droplets
      const weather = queryWeatherState();
      renderWeatherAtmosphere(ctx, output.width, output.height, weather);

      // 7. Apply optional filter color grade tint
      if (activeFilter.tint) {
        ctx.save();
        ctx.globalCompositeOperation = activeFilter.tintBlend || 'overlay';
        ctx.fillStyle = activeFilter.tint;
        ctx.fillRect(0, 0, output.width, output.height);
        ctx.restore();
      }

      return output.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.warn('[CameraMode] Composite snapshot error:', err);
      const canvas = document.querySelector('canvas');
      return canvas ? canvas.toDataURL('image/jpeg', 0.92) : null;
    }
  }, [game, activeFilter, queryWeatherState]);

  // ── PHOTO CAPTURE ──
  const handleTakePhoto = useCallback(() => {
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
    }, 160);

    const dataUrl = captureCompositeFrame();
    if (dataUrl) {
      const now = new Date();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateStr = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
      let hours = now.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const mins = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${String(hours).padStart(2, '0')}:${mins} ${ampm}`;

      const title =
        activeFilter.id !== 'normal' ? `${activeFilter.name} Snapshot` : 'Island Snapshot';

      const newPhoto: GalleryItem = {
        id: `photo_${Date.now()}`,
        type: 'photo',
        title: title,
        date: dateStr,
        time: timeStr,
        imageUrl: dataUrl,
      };

      setUserSnapshots((prev) => [newPhoto, ...prev]);
    }
  }, [captureCompositeFrame, activeFilter]);

  // ── VIDEO RECORDING START ──
  const startRecording = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    try {
      if (game) {
        try {
          const engine = game.getEngine();
          engine.renderer.render(engine.scene, engine.camera);
        } catch {}
      }

      const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
      if (!stream) {
        console.warn('captureStream not supported on canvas, taking photo instead');
        handleTakePhoto();
        return;
      }

      let mimeType = 'video/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        }
      }

      // Capture initial frame as thumbnail with full weather & filter
      try {
        videoThumbnailRef.current = captureCompositeFrame() || canvas.toDataURL('image/jpeg', 0.85);
      } catch {}

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const videoUrl = URL.createObjectURL(blob);
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dateStr = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const mins = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${String(hours).padStart(2, '0')}:${mins} ${ampm}`;

        const newVideo: GalleryItem = {
          id: `video_${Date.now()}`,
          type: 'video',
          title: 'Island Video',
          date: dateStr,
          time: timeStr,
          imageUrl: videoThumbnailRef.current || '',
          videoUrl: videoUrl,
        };

        setUserSnapshots((prev) => [newVideo, ...prev]);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Max 30 seconds recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          if (next >= 30) {
            setTimeout(() => {
              stopRecording();
            }, 0);
            return 30;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.warn('Failed to start video recording:', err);
      handleTakePhoto();
    }
  }, [game, handleTakePhoto, captureCompositeFrame]);

  // ── VIDEO RECORDING STOP ──
  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
      }
    }
    setIsRecording(false);
  }, []);

  // ── SHUTTER PRESS HANDLERS (POINTER EVENTS) ──
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isRecording) {
      stopRecording();
      return;
    }

    pressStartTimeRef.current = Date.now();
    hasTriggeredLongPressRef.current = false;
    setIsPressing(true);

    longPressTimeoutRef.current = setTimeout(() => {
      hasTriggeredLongPressRef.current = true;
      setIsPressing(false);
      startRecording();
    }, 550);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsPressing(false);

    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (isRecording) {
      return;
    }

    if (!hasTriggeredLongPressRef.current) {
      handleTakePhoto();
    }
  };

  const handlePointerCancel = () => {
    setIsPressing(false);
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  // Latest snapshot preview thumbnail for the gallery icon
  const latestSnapshot = userSnapshots[0];
  const weather = queryWeatherState();
  const isRainActive = weather.rain > 0.05;

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 select-none pointer-events-none flex flex-col justify-between p-4 sm:p-7 overflow-hidden transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] opacity-100 scale-100"
      >
        {/* Live Viewfinder Color Filter Overlay */}
        {activeFilter.cssBackdrop && (
          <div
            className={`absolute inset-0 pointer-events-none transition-all duration-300 z-0 ${activeFilter.cssBackdrop}`}
          />
        )}
        {activeFilter.tint && (
          <div
            className="absolute inset-0 pointer-events-none transition-all duration-300 z-0"
            style={{
              backgroundColor: activeFilter.tint,
              mixBlendMode: (activeFilter.tintBlend as any) || 'overlay',
            }}
          />
        )}

        {/* Snapshot White Flash */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-out fade-out duration-150" />
        )}

        {/* ── 4 VIEWFINDER CORNER BRACKETS ── */}
        <div
          className={`absolute top-5 left-5 sm:top-7 sm:left-7 w-6 h-6 border-t-2 border-l-2 border-white/75 pointer-events-none z-10 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? 'translate-x-0 translate-y-0 opacity-100' : '-translate-x-4 -translate-y-4 opacity-0'
          }`}
        />
        <div
          className={`absolute top-5 right-5 sm:top-7 sm:right-7 w-6 h-6 border-t-2 border-r-2 border-white/75 pointer-events-none z-10 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? 'translate-x-0 translate-y-0 opacity-100' : 'translate-x-4 -translate-y-4 opacity-0'
          }`}
        />
        <div
          className={`absolute bottom-5 left-5 sm:bottom-7 sm:left-7 w-6 h-6 border-b-2 border-l-2 border-white/75 pointer-events-none z-10 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? 'translate-x-0 translate-y-0 opacity-100' : '-translate-x-4 translate-y-4 opacity-0'
          }`}
        />
        <div
          className={`absolute bottom-5 right-5 sm:bottom-7 sm:right-7 w-6 h-6 border-b-2 border-r-2 border-white/75 pointer-events-none z-10 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? 'translate-x-0 translate-y-0 opacity-100' : 'translate-x-4 translate-y-4 opacity-0'
          }`}
        />

        {/* ── TOP HUD INDICATORS (Active Filter & Weather Indicator) ── */}
        <div className="z-20 flex items-center justify-between w-full pointer-events-none px-2 pt-2">
          {/* Active Filter Pill Badge */}
          {activeFilter.id !== 'normal' ? (
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white shadow-lg animate-in fade-in zoom-in-95 duration-200">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: activeFilter.badgeColor }}
              />
              <span>{activeFilter.name}</span>
            </div>
          ) : (
            <div />
          )}

          {/* Active Weather Indicator */}
          {isRainActive && (
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-sky-950/60 backdrop-blur-md border border-sky-400/20 text-[11px] font-medium text-sky-200 shadow-lg">
              <CloudRain className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              <span>Rain Lens FX</span>
            </div>
          )}
        </div>

        {/* ── RULE OF THIRDS GRID ── */}
        <div
          className={`absolute inset-5 sm:inset-7 pointer-events-none z-10 transition-all duration-300 ${
            isOpen && showGrid ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          <div className="absolute top-0 bottom-0 left-1/3 w-[1px] bg-white/15" />
          <div className="absolute top-0 bottom-0 left-2/3 w-[1px] bg-white/15" />
          <div className="absolute left-0 right-0 top-1/3 h-[1px] bg-white/15" />
          <div className="absolute left-0 right-0 top-2/3 h-[1px] bg-white/15" />
        </div>

        {/* ── BOTTOM DOCK WITH EXPANDABLE FILTER STRIP & CONTROLS ── */}
        <div className="self-center flex flex-col items-center z-30 pointer-events-auto w-full max-w-lg mb-1 sm:mb-2">
          {/* Expandable Camera Filter Carousel */}
          {showFilterPicker && (
            <div className="w-full mb-3 px-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center space-x-1.5 p-2 rounded-2xl bg-black/65 backdrop-blur-xl border border-white/15 shadow-2xl overflow-x-auto glass-scrollbar">
                {CAMERA_FILTERS.map((f) => {
                  const isSelected = activeFilterId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActiveFilterId(f.id)}
                      className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white text-neutral-950 shadow-md scale-105 font-bold'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/[0.06]'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: f.badgeColor }}
                      />
                      <span>{f.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Control Bar (Clean Frameless Smoked Glass) */}
          <div
            className={`flex items-center space-x-2.5 sm:space-x-3.5 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95'
            }`}
          >
            {/* 1. Gallery / Photos Button (With Latest Snapshot Preview Thumbnail) */}
            <button
              onClick={() => setIsGalleryOpen(true)}
              title="Saved Photos & Gallery"
              aria-label="Saved Photos & Gallery"
              className="relative w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/55 active:scale-95 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md flex items-center justify-center transition-all focus:outline-none cursor-pointer overflow-hidden"
            >
              {latestSnapshot ? (
                <img
                  src={latestSnapshot.imageUrl}
                  alt="Latest"
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <ImageIcon className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
              )}
            </button>

            {/* 2. Grid Toggle Button (3x3 Grid) - 1-Tap Toggle ON / OFF */}
            <button
              onClick={() => setShowGrid((prev) => !prev)}
              title={showGrid ? 'Hide Grid' : 'Show Grid'}
              aria-label={showGrid ? 'Hide Grid' : 'Show Grid'}
              className={`w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all focus:outline-none cursor-pointer active:scale-95 backdrop-blur-md ${
                showGrid
                  ? 'bg-black/60 text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_4px_12px_rgba(0,0,0,0.35)]'
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)]'
              }`}
            >
              <Grid3X3 className="w-5 h-5 stroke-[1.9] drop-shadow-sm" />
            </button>

            {/* 3. Hero Shutter Capture Button (Phone-style outer border circle + inner smooth morph) */}
            <button
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={handlePointerCancel}
              title={isRecording ? 'Stop Recording Video' : 'Tap for Photo, Hold for Video'}
              aria-label={isRecording ? 'Stop Recording Video' : 'Tap for Photo, Hold for Video'}
              className={`relative w-15 h-15 sm:w-16 sm:h-16 rounded-full border-[3px] p-[3px] flex items-center justify-center transition-all duration-300 ease-out focus:outline-none cursor-pointer select-none ${
                isRecording
                  ? 'scale-110 border-rose-500 shadow-[0_0_28px_rgba(244,63,94,0.7)] ring-2 ring-rose-500/40 bg-black/40'
                  : 'border-white/85 hover:border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] bg-transparent active:scale-95'
              }`}
            >
              <div
                className={`transition-all duration-300 ease-out ${
                  isRecording
                    ? 'w-5.5 h-5.5 sm:w-6 sm:h-6 rounded-[7px] bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.85)] scale-100'
                    : isPressing
                    ? 'w-full h-full rounded-full bg-white scale-90 shadow-sm'
                    : 'w-full h-full rounded-full bg-white scale-100 shadow-sm'
                }`}
              />
            </button>

            {/* 4. Filter Button (Toggles Filter Carousel Drawer) */}
            <button
              onClick={() => setShowFilterPicker((prev) => !prev)}
              title="Camera Color Filters"
              aria-label="Camera Color Filters"
              className={`relative w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all focus:outline-none cursor-pointer active:scale-95 backdrop-blur-md ${
                showFilterPicker || activeFilterId !== 'normal'
                  ? 'bg-white text-neutral-950 shadow-[0_0_16px_rgba(255,255,255,0.4)] font-bold'
                  : 'bg-black/40 hover:bg-black/55 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)]'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-[1.9] drop-shadow-sm">
                <circle cx="12" cy="8.2" r="4.2" />
                <circle cx="8.2" cy="14.8" r="4.2" />
                <circle cx="15.8" cy="14.8" r="4.2" />
              </svg>
              {activeFilterId !== 'normal' && (
                <span
                  className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-black"
                  style={{ backgroundColor: activeFilter.badgeColor }}
                />
              )}
            </button>

            {/* 5. Close / Exit Camera Mode Button */}
            <button
              onClick={onClose}
              title="Exit Camera Mode"
              aria-label="Exit Camera Mode"
              className="w-10.5 h-10.5 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/55 active:scale-90 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_10px_rgba(0,0,0,0.3)] backdrop-blur-md flex items-center justify-center transition-all focus:outline-none cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[2.2] drop-shadow-sm" />
            </button>
          </div>
        </div>
      </div>

      {/* ── CAMERA GALLERY MODAL ── */}
      <CameraGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        userSnapshots={userSnapshots}
        onDeleteSnapshot={(id) => {
          setUserSnapshots((prev) => prev.filter((item) => item.id !== id));
        }}
      />
    </>
  );
};
