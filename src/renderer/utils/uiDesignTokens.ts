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
  shell: '#07101D',
  panel: '#111827',
  panelMuted: '#151D2C',
  surface: '#1A2435',
  border: '#263248',
  borderSubtle: 'rgba(148,163,184,0.14)',
  text: '#F8FAFC',
  textMuted: '#CBD5E1',
  textSubtle: '#7F8EA3',
  hover: 'rgba(124,58,237,0.10)',
  hoverStrong: 'rgba(124,58,237,0.16)',
  selected: 'rgba(124,58,237,0.20)',
  selectedStrong: 'rgba(124,58,237,0.28)',
  accent: '#7C3AED',
} as const;

export function buildSidebarItemStyle(selected: boolean, nested = false): CSSProperties {
  return {
    color: selected ? uiColor.text : uiColor.textMuted,
    backgroundColor: selected ? uiColor.selected : 'transparent',
    fontWeight: selected ? 600 : 500,
    borderRadius: uiRadius.md,
    padding: `7px ${uiSpacing.md}px 7px ${nested ? 18 : uiSpacing.sm}px`,
    fontSize: 12,
    minHeight: 32,
  };
}

export function buildIconButtonStyle(active = false): CSSProperties {
  return {
    color: active ? uiColor.text : uiColor.textMuted,
    backgroundColor: active ? uiColor.selected : 'transparent',
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
      backgroundColor: 'rgba(124,58,237,0.18)',
      border: '1px solid rgba(124,58,237,0.34)',
      borderRadius: uiRadius.lg,
    };
  }

  if (unread) {
    return {
      backgroundColor: 'rgba(124,58,237,0.08)',
      boxShadow: 'inset 3px 0 0 rgba(124,58,237,0.90)',
      borderRadius: uiRadius.lg,
    };
  }

  return {
    backgroundColor: 'transparent',
    borderRadius: uiRadius.lg,
  };
}

export function buildModalShellStyle(): CSSProperties {
  return {
    backgroundColor: '#0B1220',
    border: `1px solid ${uiColor.border}`,
    borderRadius: uiRadius.xl,
    boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
  };
}

export function buildFieldRowStyle(): CSSProperties {
  return {
    borderBottom: `1px solid ${uiColor.borderSubtle}`,
    minHeight: 48,
  };
}
