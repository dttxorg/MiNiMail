import {
  buildRoutingDiagnosticsEntries,
  type RoutingDiagnosticsRecord,
} from '../../shared/email-ai/routingDiagnostics';
import type { MailRoutingAdapterResult, MailRoutingFolderId, MailRoutingResultEntry } from './mailRoutingAdapter';
import { isGitHubSmartFolderId, isPriorityFolderId } from './mailRoutingAdapter';

export type MailRoutingDiagnostics = RoutingDiagnosticsRecord & {
  matched_folder: MailRoutingFolderId;
};

interface BuildMailRoutingExplanationMapArgs {
  routingResults?: MailRoutingResultEntry[];
  routingAdapter: MailRoutingAdapterResult;
  contextFolder?: string;
  appLanguage?: string;
}

function localize(appLanguage: string | undefined, zh: string, en: string): string {
  return appLanguage === 'zh' ? zh : en;
}

function normalizeAppLanguage(appLanguage?: string): string {
  return (appLanguage || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function chooseTargetFolder(
  memberships: MailRoutingFolderId[],
  routing: MailRoutingResultEntry['routing'],
  contextFolder: string | undefined,
): MailRoutingFolderId | undefined {
  if ((isGitHubSmartFolderId(contextFolder || '') || isPriorityFolderId(contextFolder || '')) && memberships.includes(contextFolder as MailRoutingFolderId)) {
    return contextFolder as MailRoutingFolderId;
  }

  if (routing.kind === 'github') {
    return routing.smart_folder.folder;
  }

  if (routing.smart_folder?.folder && memberships.includes(routing.smart_folder.folder as MailRoutingFolderId)) {
    return routing.smart_folder.folder as MailRoutingFolderId;
  }

  return memberships[0];
}

export function buildMailRoutingDiagnosticsMap({
  routingResults = [],
  routingAdapter,
  contextFolder,
  appLanguage,
}: BuildMailRoutingExplanationMapArgs): Record<string, MailRoutingDiagnostics | undefined> {
  const language = normalizeAppLanguage(appLanguage);
  const diagnostics = buildRoutingDiagnosticsEntries({
    routingResults,
    mailFolderMembership: routingAdapter.mailFolderMembership,
    appLanguage: language,
  });

  const explanations: Record<string, MailRoutingDiagnostics | undefined> = {};
  for (const diagnostic of diagnostics) {
    const chosenFolder = chooseTargetFolder(diagnostic.all_matched_folders as MailRoutingFolderId[], {
      kind: diagnostic.family === 'github' ? 'github' : 'generic',
      light_scan: {
        importance_score: diagnostic.key_scores.importance_score,
        urgency_score: diagnostic.key_scores.urgency_score,
        actionability_score: diagnostic.key_scores.actionability_score,
        risk_score: diagnostic.key_scores.risk_score,
        density_score: 0,
        relationship_score: diagnostic.key_scores.relationship_score,
        total_light_score: diagnostic.key_scores.total_light_score,
        force_upgrade: Boolean(diagnostic.force_upgrade_reason),
        recommended_depth: diagnostic.recommended_depth,
        reasons: [],
      },
      smart_folder: diagnostic.matched_folder ? { family: diagnostic.family === 'github' ? 'github' : 'generic', folder: diagnostic.matched_folder, reasons: [] } : null,
      ...(diagnostic.family === 'github'
        ? {
            github: {
              parser: 'github',
              is_github: true,
              repository_owner: '',
              repository_name: '',
              repository_full_name: '',
              entity_type: 'unknown',
              event_type: diagnostic.github_event_type || 'unknown',
              entity_title: '',
              thread_key: '',
              short_summary: '',
              newest_content: '',
              needs_user_action: false,
              priority_score: 0,
              todo_items: [],
              reasons: [],
            },
          }
        : {}),
    } as MailRoutingResultEntry['routing'], contextFolder);

    explanations[diagnostic.mail_id] = {
      ...diagnostic,
      matched_folder: (chosenFolder || diagnostic.matched_folder) as MailRoutingFolderId,
    };
  }

  return explanations;
}

export const buildMailRoutingExplanationMap = buildMailRoutingDiagnosticsMap;
export type MailRoutingExplanation = MailRoutingDiagnostics;
