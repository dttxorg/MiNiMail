import { useState } from 'react';
import { getSenderAvatarBranding } from '../utils/senderAvatarBranding';

const AVATAR_COLORS = [
  '#ff375f', '#ff9f0a', '#30d158',
  '#64d2ff', '#0071e3', '#bf5af2',
  '#ffd60a', '#ff6b35',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface SenderAvatarProps {
  email?: string;
  name?: string;
  size?: number;
  className?: string;
}

export function SenderAvatar({ email, name, size = 28, className = '' }: SenderAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const displayName = name || email || '';
  const bg = getAvatarColor(displayName);
  const branding = getSenderAvatarBranding(email, name);
  const fontSize = size <= 24 ? 10 : size <= 32 ? 11 : 13;

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 rounded-full font-semibold text-white select-none overflow-hidden ${className}`}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {branding.kind === 'logo' && !imgFailed ? (
        <img
          src={branding.logoUrl}
          alt={displayName}
          width={size}
          height={size}
          className="object-cover w-full h-full"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span style={{ fontSize }}>{branding.initials}</span>
      )}
    </div>
  );
}
