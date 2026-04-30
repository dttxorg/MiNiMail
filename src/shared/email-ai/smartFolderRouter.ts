import type {
  GithubDedicatedParseResult,
  GitHubSmartFolder,
  LightScanResult,
  SmartFolderRoute,
} from './scanTypes';

const NEEDS_REPLY_REASON = 'explicit review/reply/approval/pay action requested';
const RISK_REASON = 'security, fraud, payment, or legal risk language detected';
const DELIVERY_FAILURE_REASON = 'delivery failure needs sender attention';

export function matchesPriorityHighBucket(lightScan: LightScanResult): boolean {
  return lightScan.force_upgrade ||
    lightScan.total_light_score >= 65 ||
    lightScan.reasons.includes(DELIVERY_FAILURE_REASON);
}

export function matchesPriorityNeedsReplyBucket(lightScan: LightScanResult): boolean {
  if (lightScan.reasons.includes(DELIVERY_FAILURE_REASON)) {
    return false;
  }

  const hasStrongActionability = lightScan.actionability_score >= 68;
  const hasModerateActionability = lightScan.actionability_score >= 48;
  const hasSupportingSignal =
    lightScan.urgency_score >= 15 ||
    lightScan.relationship_score >= 20 ||
    lightScan.importance_score >= 40;
  const hasCanonicalActionReason = lightScan.reasons.includes(NEEDS_REPLY_REASON);

  return hasStrongActionability || (hasCanonicalActionReason && hasModerateActionability && hasSupportingSignal);
}

export function matchesPriorityRiskBucket(lightScan: LightScanResult): boolean {
  return lightScan.risk_score >= 60 || lightScan.reasons.includes(RISK_REASON);
}

export function matchesPriorityLowBucket(lightScan: LightScanResult): boolean {
  return !matchesPriorityHighBucket(lightScan) &&
    !matchesPriorityNeedsReplyBucket(lightScan) &&
    !matchesPriorityRiskBucket(lightScan) &&
    !lightScan.force_upgrade &&
    lightScan.recommended_depth === 'light' &&
    lightScan.total_light_score < 35;
}

export function deriveGenericPriorityFolders(lightScan: LightScanResult): string[] {
  const folders = new Set<string>();

  if (matchesPriorityHighBucket(lightScan)) {
    folders.add('Priority/High');
  }

  if (matchesPriorityNeedsReplyBucket(lightScan)) {
    folders.add('Priority/Needs Reply');
  }

  if (matchesPriorityRiskBucket(lightScan)) {
    folders.add('Priority/Risk');
  }

  if (matchesPriorityLowBucket(lightScan)) {
    folders.add('Priority/Low');
  }

  return Array.from(folders);
}

export function routeGitHubSmartFolder(result: GithubDedicatedParseResult): SmartFolderRoute {
  let folder: GitHubSmartFolder;

  switch (result.event_type) {
    case 'security_alert':
      folder = 'GitHub/Security';
      break;
    case 'review_requested':
      folder = 'GitHub/Review Requests';
      break;
    case 'assigned_issue':
      folder = 'GitHub/Assigned to Me';
      break;
    case 'mention':
      folder = 'GitHub/Mentions';
      break;
    case 'workflow_failure':
      folder = 'GitHub/CI and Failures';
      break;
    case 'release_update_notification':
      folder = 'GitHub/Archived Updates';
      break;
    default:
      folder = result.needs_user_action ? 'GitHub/Needs Action' : 'GitHub/Low Priority';
      break;
  }

  return {
    folder,
    family: 'github',
    reasons: [...result.reasons, `github-priority:${result.priority_level || 'P3_LOW'}`],
  };
}

export function routeGenericSmartFolder(lightScan: LightScanResult): SmartFolderRoute | null {
  if (matchesPriorityRiskBucket(lightScan)) {
    return {
      folder: 'Priority/Risk',
      family: 'generic',
      reasons: lightScan.reasons,
    };
  }

  if (matchesPriorityNeedsReplyBucket(lightScan)) {
    return {
      folder: 'Priority/Needs Reply',
      family: 'generic',
      reasons: lightScan.reasons,
    };
  }

  if (matchesPriorityHighBucket(lightScan)) {
    return {
      folder: 'Priority/High',
      family: 'generic',
      reasons: lightScan.reasons,
    };
  }

  if (matchesPriorityLowBucket(lightScan)) {
    return {
      folder: 'Priority/Low',
      family: 'generic',
      reasons: lightScan.reasons,
    };
  }

  return null;
}
