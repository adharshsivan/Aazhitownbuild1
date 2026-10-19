/**
 * Lokam Mini — In-Game Chat Box
 * Neutral smoked glass chat interface matching the game HUD.
 */

import React, { useState } from 'react';
import { X, Send, MessageSquare, Smile } from 'lucide-react';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  time: string;
  isSelf?: boolean;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    sender: 'Amina',
    avatar: '👩',
    text: 'Anyone near the beach lighthouse?',
    time: '10:42 AM',
  },
  {
    id: '2',
    sender: 'Devan',
    avatar: '🏄‍♂️',
    text: 'Riding the roadster bike along the coastline! 🚲🌴',
    time: '10:43 AM',
  },
  {
    id: '3',
    sender: 'Rahul',
    avatar: '🎧',
    text: 'Sooriyan FM 89.6 is playing awesome classic hits right now!',
    time: '10:44 AM',
  },
];

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      avatar: '🤠',
      text: inputValue.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: true,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-md bg-black/65 backdrop-blur-2xl rounded-3xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.15)] select-none animate-in fade-in zoom-in-95 duration-200 text-white">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-2xl bg-white/[0.08] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] flex-shrink-0">
            <MessageSquare className="w-4.5 h-4.5 stroke-[2]" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wide leading-tight">Island World Chat</h3>
            <p className="text-white/50 text-[11px] font-normal">Connect with explorers in Fort Kochi</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-4 h-4 stroke-[2.2]" />
        </button>
      </div>

      {/* Messages List */}
      <div className="my-3 space-y-2.5 max-h-48 overflow-y-auto pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-2 text-xs ${
              msg.isSelf ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            <span className="text-base flex-shrink-0">{msg.avatar}</span>
            <div
              className={`rounded-2xl px-3 py-1.5 max-w-[80%] ${
                msg.isSelf
                  ? 'bg-sky-500/80 text-white border border-sky-400/40'
                  : 'bg-black/40 text-slate-100 border border-white/10'
              }`}
            >
              {!msg.isSelf && (
                <div className="text-[10px] font-bold text-white/70 mb-0.5">
                  {msg.sender}
                </div>
              )}
              <p className="leading-snug">{msg.text}</p>
              <div
                className={`text-[9px] mt-0.5 text-right ${
                  msg.isSelf ? 'text-sky-200' : 'text-slate-400'
                }`}
              >
                {msg.time}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input Row */}
      <div className="flex items-center space-x-2 pt-2 border-t border-white/10">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-black/40 border border-white/20 rounded-full px-3.5 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-white/50 backdrop-blur-md"
        />

        <button
          onClick={handleSend}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
