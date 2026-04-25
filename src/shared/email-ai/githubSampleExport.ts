import type { RoutingDiagnosticsMetadata, RoutingDiagnosticsSource } from './routingDiagnostics';

export interface GitHubSampleRecord {
  mail_id: string;
  matched_folder: string;
  github_event_type: string;
  repository_full_name: string;
  subject?: string;
  from?: string;
  date?: string;
  short_summary: string;
  merge_suggestion?: string;
  task_reminders: string[];
  comment_feedback: string[];
  review_reminders: string[];
  suggested_actions: string[];
}

export interface GitHubSampleSummary {
  folder_counts: Record<string, number>;
  event_counts: Record<string, number>;
}

export interface GitHubSampleExport {
  generated_at: string;
  mail_count: number;
  samples: GitHubSampleRecord[];
  summary: GitHubSampleSummary;
}

interface BuildGitHubSampleExportArgs {
  routingResults?: RoutingDiagnosticsSource[];
  metadataById?: Record<string, RoutingDiagnosticsMetadata>;
}

export function buildGitHubSampleExport({
  routingResults = [],
  metadataById = {},
}: BuildGitHubSampleExportArgs): GitHubSampleExport {
  const samples = routingResults
    .flatMap((item) => {
      if (item.routing.kind !== 'github') {
        return [];
      }

      const metadata = metadataById[item.id] || {};
      const github = item.routing.github;
      return [{
        mail_id: item.id,
        matched_folder: item.routing.smart_folder.folder,
        github_event_type: github.event_type,
        repository_full_name: github.repository_full_name,
        subject: metadata.subject,
        from: metadata.from,
        date: metadata.date,
        short_summary: github.short_summary,
        merge_suggestion: github.merge_suggestion,
        task_reminders: github.task_reminders,
        comment_feedback: github.comment_feedback,
        review_reminders: github.review_reminders,
        suggested_actions: github.suggested_actions,
      } satisfies GitHubSampleRecord];
    });

  const summary: GitHubSampleSummary = {
    folder_counts: {},
    event_counts: {},
  };

  for (const sample of samples) {
    summary.folder_counts[sample.matched_folder] = (summary.folder_counts[sample.matched_folder] || 0) + 1;
    summary.event_counts[sample.github_event_type] = (summary.event_counts[sample.github_event_type] || 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    mail_count: samples.length,
    samples,
    summary,
  };
}
