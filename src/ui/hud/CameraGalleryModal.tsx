/**
 * Lokam Mini — Camera Mode Photo & Video Gallery Modal
 * Features:
 * - Stable, fixed modal window dimensions (never jumps or resizes between single/multiple photos).
 * - Matches the clean single-image modal view perfectly.
 * - Icon-only floating action buttons (Download, Share, Delete with white icon) directly on top of the photo.
 * - Clean bottom thumbnail strip with balanced Image & Video icons (no delete button on thumbnails).
 * - Empty screen when no images exist in the gallery.
 */

import React, { useState, useEffect } from 'react';
import { Camera, X, Download, Share2, Play, Check, Trash2, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';

export interface GalleryItem {
  id: string;
  type: 'photo' | 'video';
  title: string;
  date?: string;
  time?: string;
  imageUrl: string;
  videoUrl?: string;
}

export const DEFAULT_GALLERY_ITEMS: GalleryItem[] = [];

interface CameraGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSnapshots?: GalleryItem[];
  onDeleteSnapshot?: (id: string) => void;
}

export const CameraGalleryModal: React.FC<CameraGalleryModalProps> = ({
  isOpen,
  onClose,
  userSnapshots = [],
  onDeleteSnapshot,
}) => {
  const [items, setItems] = useState<GalleryItem[]>(userSnapshots);
  const [selectedId, setSelectedId] = useState<string>(userSnapshots[0]?.id || '');
  const [copiedNotification, setCopiedNotification] = useState(false);

  useEffect(() => {
    setItems(userSnapshots);
    if (userSnapshots.length > 0) {
      if (!userSnapshots.some((s) => s.id === selectedId)) {
        setSelectedId(userSnapshots[0].id);
      }
    } else {
      setSelectedId('');
    }
  }, [userSnapshots, selectedId]);

  if (!isOpen) return null;

  const currentItem = items.find((i) => i.id === selectedId) || items[0];

  const handleDownload = () => {
    if (!currentItem) return;
    const link = document.createElement('a');
    if (currentItem.type === 'video' && currentItem.videoUrl) {
      link.href = currentItem.videoUrl;
      link.download = `Lokam_Mini_${currentItem.id}.webm`;
    } else {
      link.href = currentItem.imageUrl;
      link.download = `Lokam_Mini_${currentItem.id}.jpg`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (!currentItem) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Lokam Mini - ${currentItem.title || 'Snapshot'}`,
          text: currentItem.type === 'video' ? 'Check out this video from Lokam Mini!' : 'Check out this snapshot from Lokam Mini!',
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    navigator.clipboard?.writeText(window.location.href);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const handleDelete = (idToDelete: string) => {
    onDeleteSnapshot?.(idToDelete);
    setItems((prev) => {
      const remaining = prev.filter((item) => item.id !== idToDelete);
      if (selectedId === idToDelete) {
        if (remaining.length > 0) {
          setSelectedId(remaining[0].id);
        } else {
          setSelectedId('');
        }
      }
      return remaining;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-md transition-all duration-300 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── MAIN MODAL WINDOW CONTAINER (FIXED SIZE WITH INCREASED HEIGHT TO PREVENT ANY CROPPING) ── */}
      <div className="relative w-[740px] sm:w-[750px] max-w-[95vw] h-[600px] sm:h-[625px] max-h-[94vh] flex flex-col rounded-[26px] sm:rounded-3xl bg-[#0a0e17]/95 backdrop-blur-2xl shadow-[0_30px_70px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Subtle Ambient Highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

        {/* ── MODAL HEADER ── */}
        <div className="relative z-10 px-5 sm:px-6 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/[0.08] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] flex-shrink-0">
              <Camera className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[2] text-white" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-2xl font-extrabold tracking-wide text-white drop-shadow-sm leading-tight">
                Gallery
              </h2>
              <p className="text-white/50 text-xs sm:text-sm font-sans mt-0.5">
                Saved snapshots and island photography
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.14] active:scale-90 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* ── MAIN BODY: PHOTO VIEWER & BOTTOM CAROUSEL (CONSTANT FIXED SIZE) ── */}
        <div className="relative z-10 p-3 sm:p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          {items.length === 0 ? (
            /* Empty Screen When No Images in Gallery */
            <div className="flex-1 w-full rounded-2xl bg-black/35 flex flex-col items-center justify-center p-6 text-center select-none">
              <div className="w-16 h-16 rounded-3xl bg-white/[0.06] flex items-center justify-center text-white/40 mb-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
                <Camera className="w-8 h-8 stroke-[1.8]" />
              </div>
              <h3 className="text-white font-semibold text-lg tracking-wide">No Images in Gallery</h3>
              <p className="text-white/45 text-xs sm:text-sm max-w-xs mt-1.5 font-sans leading-relaxed">
                Your gallery is empty. Enter Camera Mode and tap the shutter button to take photos, or hold to record videos.
              </p>
            </div>
          ) : (
            <>
              {/* ── MAIN VIEWER (NO CROP, FULL UNCONSTRAINED HEIGHT) ── */}
              <div className="relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-2xl">
                {currentItem.type === 'video' && currentItem.videoUrl ? (
                  <video
                    key={currentItem.videoUrl}
                    src={currentItem.videoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-contain rounded-2xl select-none"
                  />
                ) : (
                  <img
                    src={currentItem.imageUrl}
                    alt={currentItem.title || 'Snapshot'}
                    className="w-full h-full object-contain rounded-2xl select-none"
                  />
                )}

                {/* Floating Action Buttons DIRECTLY ON TOP OF IMAGE (Download, Share, Delete) */}
                <div className="absolute top-3.5 right-3.5 z-20 flex items-center space-x-2">
                  {/* Download Button */}
                  <button
                    onClick={handleDownload}
                    title="Download"
                    aria-label="Download"
                    className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/85 active:scale-90 backdrop-blur-xl flex items-center justify-center text-white cursor-pointer transition-all shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                  >
                    <Download className="w-4.5 h-4.5 stroke-[2] text-white" />
                  </button>

                  {/* Share Button */}
                  <button
                    onClick={handleShare}
                    title="Share"
                    aria-label="Share"
                    className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/85 active:scale-90 backdrop-blur-xl flex items-center justify-center text-white cursor-pointer transition-all shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                  >
                    {copiedNotification ? (
                      <Check className="w-4.5 h-4.5 text-emerald-400 stroke-[2.5]" />
                    ) : (
                      <Share2 className="w-4.5 h-4.5 stroke-[2] text-white" />
                    )}
                  </button>

                  {/* Delete Button (Pure White Icon) */}
                  <button
                    onClick={() => handleDelete(currentItem.id)}
                    title="Delete"
                    aria-label="Delete"
                    className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/85 active:scale-90 backdrop-blur-xl flex items-center justify-center text-white cursor-pointer transition-all shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                  >
                    <Trash2 className="w-4.5 h-4.5 stroke-[2] text-white" />
                  </button>
                </div>
              </div>

              {/* ── BOTTOM HORIZONTAL SCROLL CAROUSEL FOR OTHER PHOTOS & VIDEOS (IF MULTIPLE) ── */}
              {items.length > 1 && (
                <div className="w-full flex-shrink-0 pt-2.5 mt-1 border-t border-white/[0.06]">
                  <div className="flex items-center space-x-2.5 sm:space-x-3 overflow-x-auto py-2 px-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-white/[0.02] [&::-webkit-scrollbar-thumb]:bg-white/[0.15] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/[0.25]">
                    {items.map((item) => {
                      const isSelected = item.id === selectedId;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`group relative w-24 h-16 sm:w-28 sm:h-18 flex-shrink-0 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 my-0.5 ${
                            isSelected
                              ? 'ring-2 ring-white shadow-[0_0_16px_rgba(255,255,255,0.25)]'
                              : 'opacity-60 hover:opacity-100 bg-white/[0.04]'
                          }`}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.title || 'Thumbnail'}
                            className="w-full h-full object-cover select-none pointer-events-none"
                          />

                          {/* Bottom-Left Type Icon Badge (Matched Image & Video outline icons) */}
                          <div className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-md bg-black/75 backdrop-blur-md flex items-center justify-center text-white/90 shadow-sm pointer-events-none">
                            {item.type === 'photo' ? (
                              <ImageIcon className="w-3.2 h-3.2 text-white/90 stroke-[2]" />
                            ) : (
                              <VideoIcon className="w-3.2 h-3.2 text-white/90 stroke-[2]" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
