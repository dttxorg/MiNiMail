import type { CSSProperties } from 'react';

export const uiSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const uiRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const uiColor = {
  // Three-column progressive surfaces (由暗至明、自然聚焦)
  canvas: '#0A0B0E',
  sidebar: '#101216',
  mailList: '#13151A',
  mailDetail: '#171920',

  // Backward-compatible panel mappings
  shell: '#101216',
  panel: '#13151A',
  panelMuted: '#171920',
  surface: '#1E2028',

  // Precision 1px subtle borders (高级微光边缘)
  border: 'rgba(255, 255, 255, 0.08)',
  borderSubtle: 'rgba(255, 255, 255, 0.05)',

  // Typography tokens
  text: '#FFFFFF',
  textMuted: '#D1D5DB',
  textSubtle: '#8E8E93',

  // Modern Unified Accent: Electric Indigo
  accent: '#6366F1',
  accentHover: '#4F46E5',
  accentBg: 'rgba(99, 102, 241, 0.12)',

  // Micro-interaction states
  hover: 'rgba(255, 255, 255, 0.04)',
  hoverStrong: 'rgba(255, 255, 255, 0.07)',
  selected: 'rgba(99, 102, 241, 0.14)',
  selectedStrong: 'rgba(99, 102, 241, 0.22)',
} as const;

export function buildSidebarItemStyle(selected: boolean, nested = false): CSSProperties {
  return {
    color: selected ? '#FFFFFF' : uiColor.textSubtle,
    backgroundColor: selected ? 'rgba(99, 102, 241, 0.14)' : 'transparent',
    fontWeight: selected ? 600 : 500,
    borderRadius: uiRadius.md,
    padding: `7px ${uiSpacing.md}px 7px ${nested ? 18 : uiSpacing.sm}px`,
    fontSize: 12,
    minHeight: 32,
    transition: 'background-color 150ms ease, color 150ms ease',
  };
}

export function buildIconButtonStyle(active = false): CSSProperties {
  return {
    color: active ? '#FFFFFF' : uiColor.textSubtle,
    backgroundColor: active ? 'rgba(99, 102, 241, 0.14)' : 'transparent',
    borderRadius: uiRadius.md,
    transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
  };
}

export function buildPanelStyle(): CSSProperties {
  return {
    backgroundColor: uiColor.panel,
    border: `1px solid ${uiColor.borderSubtle}`,
    borderRadius: uiRadius.lg,
  };
}

export function buildSubtlePanelStyle(): CSSProperties {
  return {
    backgroundColor: uiColor.panelMuted,
    border: `1px solid ${uiColor.borderSubtle}`,
    borderRadius: uiRadius.lg,
  };
}

export function buildMailRowStyle(active: boolean, unread: boolean): CSSProperties {
  if (active) {
    return {
      backgroundColor: 'rgba(99, 102, 241, 0.14)',
      border: '1px solid rgba(99, 102, 241, 0.28)',
      borderRadius: uiRadius.lg,
      transition: 'all 150ms ease',
    };
  }

  if (unread) {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      boxShadow: 'inset 2.5px 0 0 #6366F1',
      borderRadius: uiRadius.lg,
      border: '1px solid transparent',
      transition: 'all 150ms ease',
    };
  }

  return {
    backgroundColor: 'transparent',
    borderRadius: uiRadius.lg,
    border: '1px solid transparent',
    transition: 'all 150ms ease',
  };
}

export function buildModalShellStyle(): CSSProperties {
  return {
    backgroundColor: '#12141A',
    border: `1px solid ${uiColor.border}`,
    borderRadius: uiRadius.xl,
    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
  };
}

export function buildFieldRowStyle(): CSSProperties {
  return {
    borderBottom: `1px solid ${uiColor.borderSubtle}`,
    minHeight: 48,
  };
}
