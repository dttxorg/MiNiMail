import { buildEmailAiSnapshot, type MailLikeForAi } from './fromBodies';
import { parseGitHubDedicatedResult } from './githubNotifications';
import { scanEmailLightweight } from './lightweightScanner';
import { routeGenericSmartFolder, routeGitHubSmartFolder } from './smartFolderRouter';
import { evaluateForceUpgradeRules } from './scanUpgradeRules';
import type {
  GenericScanPipelineResult,
  GithubDedicatedParseResult,
  GithubScanPipelineResult,
  LightScanInput,
  ScanPipelineResult,
} from './scanTypes';

export interface ScanPipelineInput extends MailLikeForAi {
  hasAttachments?: boolean;
  headers?: Record<string, string | string[] | undefined>;
  importantContacts?: string[];
  relationshipContacts?: string[];
}

export type RequestedScanMode = 'smart' | 'light' | 'deep';
export type EffectiveScanMode = 'light' | 'deep';

function isGitHubMail(input: ScanPipelineInput): boolean {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(input.headers || {}).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(',') : value || '',
    ]),
  );
  const headerBlob = Object.entries(normalizedHeaders)
    .map(([key, value]) => `${key}:${value}`)
    .join('\n');
  const fromBlob = `${input.from || ''}\n${input.fromName || ''}`.toLowerCase();
  const subject = (input.subject || '').toLowerCase();
  const preview = `${input.snippet || ''}\n${input.bodyText || ''}`.toLowerCase();

  const hasGitHubHeaders = Object.keys(normalizedHeaders).some((key) => key.startsWith('x-github-')) ||
    /list-id:.*github/i.test(headerBlob);
  const fromGitHub = /(?:notifications|noreply|reply|support|alerts?)@github\.com\b|@githubmail\.com\b/i.test(fromBlob);
  const hasGitHubStyleSubject =
    /^\[github\]/i.test(subject) ||
    /^\[[a-z0-9_.-]+\/[a-z0-9_.-]+\]/i.test(subject) ||
    /\bgithub\b.*\b(review|pull request|issue|workflow|dependabot|security|device|oauth|account)\b/i.test(subject);
  const hasGitHubUrl =
    /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(pull|issues|discussions|actions\/runs|security|releases)/i.test(preview) ||
    /https:\/\/github\.com\/settings\/(?:applications|keys|security)/i.test(preview);
  const hasGitHubContext =
    /requested your review|mentioned you|assigned you|dependabot|workflow failed|pull request|issue #\d+|verify your device|oauth application|linked to your github account|security key|ssh key|sign-in attempt|repository .*? on github|view it on github/i.test(preview);

  return hasGitHubHeaders || (fromGitHub && (hasGitHubStyleSubject || hasGitHubContext || hasGitHubUrl));
}

function toLightScanInput(input: ScanPipelineInput): LightScanInput {
  return {
    subject: input.subject || '',
    from: input.from || '',
    from_name: input.fromName || '',
    to: input.to,
    cc: input.cc,
    snippet: input.snippet,
    body_text: input.bodyText,
    body_html: input.bodyHtml,
    has_attachments: input.hasAttachments,
    headers: input.headers,
    important_contacts: input.importantContacts,
    relationship_contacts: input.relationshipContacts,
  };
}

function applyUpgradeOverride(
  result: ReturnType<typeof scanEmailLightweight>,
  input: LightScanInput,
  github?: GithubDedicatedParseResult | null,
) {
  const upgrade = evaluateForceUpgradeRules(input, github ?? null);

  if (!upgrade.force_upgrade) return result;

  return {
    ...result,
    force_upgrade: true,
    recommended_depth: upgrade.recommended_depth,
    reasons: [...result.reasons, ...upgrade.reasons.map((reason) => `force-upgrade:${reason}`)],
  };
}

export function runScanPipeline(input: ScanPipelineInput): ScanPipelineResult {
  const snapshot = buildEmailAiSnapshot({
    subject: input.subject,
    from: input.from,
    fromName: input.fromName,
    to: input.to,
    cc: input.cc,
    date: input.date,
    snippet: input.snippet,
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
    messageId: input.messageId,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });

  const lightScanInput = toLightScanInput(input);

  if (isGitHubMail(input)) {
    const github = parseGitHubDedicatedResult({
      ...snapshot.parsed,
      headers: Object.fromEntries(
        Object.entries(input.headers || {}).map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.filter(Boolean) as string[] : value ? [value] : [],
        ])
      ),
    });
    const light_scan = applyUpgradeOverride(scanEmailLightweight(lightScanInput), lightScanInput, github);
    const smart_folder = routeGitHubSmartFolder(github);
    return {
      kind: 'github',
      light_scan,
      github,
      smart_folder,
    } satisfies GithubScanPipelineResult;
  }

  const light_scan = applyUpgradeOverride(scanEmailLightweight(lightScanInput), lightScanInput, null);
  return {
    kind: 'generic',
    light_scan,
    smart_folder: routeGenericSmartFolder(light_scan),
  } satisfies GenericScanPipelineResult;
}

export function resolveIntelligentScanMode(
  result: ScanPipelineResult,
  requestedMode: RequestedScanMode,
): EffectiveScanMode {
  if (requestedMode === 'deep') {
    return 'deep';
  }

  if (requestedMode === 'light') {
    return 'light';
  }

  return result.light_scan.total_light_score < 35 ? 'deep' : 'light';
}
