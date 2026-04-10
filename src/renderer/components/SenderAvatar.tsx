// src/renderer/components/SenderAvatar.tsx
import React from 'react';

const AVATAR_COLORS = [
  '#ff375f', '#ff9f0a', '#30d158',
  '#64d2ff', '#0071e3', '#bf5af2',
  '#ffd60a', '#ff6b35',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

interface SenderAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function SenderAvatar({ name, size = 28, className = '' }: SenderAvatarProps) {
  const displayName = name || '?';
  const bg = getAvatarColor(displayName);
  const initials = getInitials(displayName);
  const fontSize = size <= 24 ? 10 : size <= 32 ? 11 : 13;

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 rounded-full font-semibold text-white select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
    >
      {initials}
    </div>
  );
}
