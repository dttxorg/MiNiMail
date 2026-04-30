import type { GitHubPriorityLevel } from '../../shared/email-ai';
import type { AppLanguage } from '../../shared/mailFolders';

export interface GitHubPriorityBadgeInfo {
  level: GitHubPriorityLevel;
  label: string;
  shortLabel: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  tooltip: string;
}

const PRIORITY_LABELS: Record<GitHubPriorityLevel, Record<'zh' | 'en', string>> = {
  P0_URGENT: { zh: '紧急', en: 'Urgent' },
  P1_IMPORTANT: { zh: '重要', en: 'Important' },
  P2_NORMAL: { zh: '普通', en: 'Normal' },
  P3_LOW: { zh: '低优先级', en: 'Low Priority' },
};

const PRIORITY_TONES: Record<GitHubPriorityLevel, Pick<GitHubPriorityBadgeInfo, 'color' | 'backgroundColor' | 'borderColor'>> = {
  P0_URGENT: { color: '#fecdd3', backgroundColor: 'rgba(244,63,94,0.22)', borderColor: 'rgba(244,63,94,0.42)' },
  P1_IMPORTANT: { color: '#fed7aa', backgroundColor: 'rgba(249,115,22,0.18)', borderColor: 'rgba(249,115,22,0.38)' },
  P2_NORMAL: { color: '#bfdbfe', backgroundColor: 'rgba(59,130,246,0.16)', borderColor: 'rgba(59,130,246,0.32)' },
  P3_LOW: { color: '#cbd5e1', backgroundColor: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.24)' },
};

function toSupportedLanguage(appLanguage: AppLanguage | string): 'zh' | 'en' {
  return appLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getGitHubPriorityBadgeInfo(
  level: GitHubPriorityLevel,
  appLanguage: AppLanguage | string,
  friendlyText?: string,
  safeSummary?: string,
): GitHubPriorityBadgeInfo {
  const language = toSupportedLanguage(appLanguage);
  const label = PRIORITY_LABELS[level][language];
  const shortLabel = level.slice(0, 2);
  const details = [friendlyText, `${shortLabel} ${label}`, safeSummary].filter(Boolean).join('\n');
  return {
    level,
    label,
    shortLabel,
    tooltip: details,
    ...PRIORITY_TONES[level],
  };
}

export function getGitHubFolderPriorityHint(folderId: string): GitHubPriorityLevel | null {
  if (folderId === 'GitHub/Security' || folderId === 'GitHub/CI and Failures') return 'P0_URGENT';
  if (folderId === 'GitHub/Review Requests' || folderId === 'GitHub/Assigned to Me' || folderId === 'GitHub/Mentions' || folderId === 'GitHub/Needs Action') return 'P1_IMPORTANT';
  if (folderId === 'GitHub/Low Priority' || folderId === 'GitHub/Archived Updates') return 'P3_LOW';
  return null;
}
