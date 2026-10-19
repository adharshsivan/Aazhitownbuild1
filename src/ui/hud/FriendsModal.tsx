/**
 * Lokam Mini — Friends & Social Party Modal
 * Smoked frosted glass modal displaying active island players, proximity party, and invite options.
 */

import React, { useState } from 'react';
import {
  X,
  Users,
  UserPlus,
  Radio,
  MapPin,
  MessageSquare,
  Sparkles,
  Check,
  Shield,
  Circle,
} from 'lucide-react';

export interface FriendProfile {
  id: string;
  name: string;
  status: 'Online' | 'In Mini-Game' | 'Nearby' | 'Exploring';
  location: string;
  avatarColor: string;
  level: number;
}

const MOCK_FRIENDS: FriendProfile[] = [
  {
    id: 'anand_kl07',
    name: 'Anand_KL07',
    status: 'Nearby',
    location: 'Chinese Fishing Nets',
    avatarColor: '#38bdf8', // Cyan
    level: 14,
  },
  {
    id: 'priya_kochi',
    name: 'Priya_Kochi',
    status: 'In Mini-Game',
    location: 'Coastal Cycling Race',
    avatarColor: '#ec4899', // Pink
    level: 19,
  },
  {
    id: 'manu_rider',
    name: 'Manu_Rider',
    status: 'Nearby',
    location: 'Aazhi Waterfront',
    avatarColor: '#10b981', // Emerald
    level: 22,
  },
  {
    id: 'deepa_sunset',
    name: 'Deepa_Sunset',
    status: 'Exploring',
    location: 'Heritage Dutch Museum',
    avatarColor: '#f59e0b', // Amber
    level: 11,
  },
  {
    id: 'rohit_spice',
    name: 'Rohit_Spice',
    status: 'Exploring',
    location: 'Spice Bazaar Cafe',
    avatarColor: '#a855f7', // Purple
    level: 16,
  },
];

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeleportToFriend?: (friend: FriendProfile) => void;
  onInviteFriend?: (friend: FriendProfile) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  onTeleportToFriend,
  onInviteFriend,
}) => {
  const [invitedId, setInvitedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInvite = (friend: FriendProfile) => {
    setInvitedId(friend.id);
    onInviteFriend?.(friend);
    setTimeout(() => setInvitedId(null), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-neutral-950/90 border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
              <Users className="w-5 h-5 text-sky-400 stroke-[2]" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-wide">
                Friends & Party
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                {MOCK_FRIENDS.length} island explorers nearby in Fort Kochi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close friends"
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>
        </div>

        {/* Friends List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {MOCK_FRIENDS.map((friend) => {
            const isInvited = invitedId === friend.id;
            return (
              <div
                key={friend.id}
                className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-all"
              >
                {/* Left: Avatar & Info */}
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className="relative w-10.5 h-10.5 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0"
                    style={{ backgroundColor: friend.avatarColor }}
                  >
                    {friend.name.charAt(0)}
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-neutral-950" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {friend.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.08] text-white/60">
                        Lv.{friend.level}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 text-xs text-white/50 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0 text-white/40" />
                      <span className="truncate">{friend.location}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onTeleportToFriend?.(friend)}
                    title="Teleport to friend"
                    className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1"
                  >
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
                    <span className="hidden sm:inline">Join</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInvite(friend)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                      isInvited
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-white text-neutral-950 hover:bg-neutral-200 active:scale-95 shadow-sm'
                    }`}
                  >
                    {isInvited ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Invited</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Invite</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
