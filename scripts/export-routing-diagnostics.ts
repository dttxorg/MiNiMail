import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildGitHubSampleExport,
  buildNeedsReplyCandidateExport,
  buildRoutingDiagnosticsExport,
  type GitHubSampleExport,
  type NeedsReplyCandidateExport,
  type NeedsReplyCandidateSource,
  runScanPipeline,
  type RoutingDiagnosticsExport,
  type RoutingDiagnosticsSource,
} from '../src/shared/email-ai';

type CachedMailRow = {
  id: string;
  from: string;
  from_name: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  has_attachments: number;
  folder: string;
  account_id: number;
  message_id?: string | null;
  in_reply_to?: string | null;
  references_header?: string | null;
  body_html?: string | null;
  body_text?: string | null;
};

type CliOptions = {
  dbPath: string;
  outPath: string;
  accountId?: number;
  folder?: string;
  limit?: number;
  appLanguage: string;
  mode: 'routing' | 'needs-reply' | 'github-samples';
};

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const options: Partial<CliOptions> = {
    appLanguage: 'en',
    mode: 'routing',
  };

  while (args.length > 0) {
    const current = args.shift();
    const value = args[0];

    switch (current) {
      case '--db':
        options.dbPath = value || '';
        args.shift();
        break;
      case '--out':
        options.outPath = value || '';
        args.shift();
        break;
      case '--account':
        options.accountId = value ? Number(value) : undefined;
        args.shift();
        break;
      case '--folder':
        options.folder = value;
        args.shift();
        break;
      case '--limit':
        options.limit = value ? Number(value) : undefined;
        args.shift();
        break;
      case '--lang':
        options.appLanguage = value || 'en';
        args.shift();
        break;
      case '--mode':
        options.mode = value === 'needs-reply'
          ? 'needs-reply'
          : value === 'github-samples'
            ? 'github-samples'
            : 'routing';
        args.shift();
        break;
      default:
        break;
    }
  }

  const dbPath = options.dbPath || resolveDefaultMailCacheDbPath();
  const outPath = options.outPath || path.resolve(process.cwd(), `routing-diagnostics-${Date.now()}.json`);

  return {
    dbPath,
    outPath,
    accountId: Number.isFinite(options.accountId) ? options.accountId : undefined,
    folder: options.folder,
    limit: Number.isFinite(options.limit) ? options.limit : undefined,
    appLanguage: options.appLanguage || 'en',
    mode: options.mode || 'routing',
  };
}

export function resolveDefaultMailCacheDbPath(): string {
  const roots = [process.env.APPDATA, process.env.HOME, process.cwd()].filter(Boolean) as string[];
  const candidates = roots.flatMap((root) => [
    path.join(root, 'MinNiMail', 'mail_cache.db'),
    path.join(root, 'apark', 'mail_cache.db'),
  ]);

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || candidates[0];
}

function buildQuery(options: CliOptions): { sql: string; params: Array<string | number> } {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (options.accountId != null) {
    where.push('account_id = ?');
    params.push(options.accountId);
  }

  if (options.folder) {
    where.push('folder = ?');
    params.push(options.folder);
  }

  const limitClause = options.limit ? ` LIMIT ${Math.max(1, options.limit)}` : '';
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `
      SELECT
        id, "from", from_name, "to", subject, date, snippet,
        has_attachments, folder, account_id, message_id, in_reply_to,
        references_header, body_html, body_text
      FROM mail_cache
      ${whereClause}
      ORDER BY datetime(date) DESC
      ${limitClause}
    `,
    params,
  };
}

function loadCachedMails(dbPath: string, options: CliOptions): CachedMailRow[] {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`mail_cache.db not found at ${dbPath}. Use --db to specify the cache database path.`);
  }

  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    const { sql, params } = buildQuery(options);
    return db.prepare(sql).all(...params) as CachedMailRow[];
  } finally {
    db.close();
  }
}

function buildSources(rows: CachedMailRow[]): { routingResults: RoutingDiagnosticsSource[]; needsReplySources: NeedsReplyCandidateSource[] } {
  const shared = rows.map((row) => {
    const routing = runScanPipeline({
      subject: row.subject,
      from: row.from,
      fromName: row.from_name,
      to: row.to,
      date: row.date,
      snippet: row.snippet,
      bodyHtml: row.body_html || undefined,
      bodyText: row.body_text || undefined,
      messageId: row.message_id || undefined,
      inReplyTo: row.in_reply_to || undefined,
      references: row.references_header || undefined,
      hasAttachments: Boolean(row.has_attachments),
    });

    return {
      row,
      routing,
    };
  });

  return {
    routingResults: shared.map(({ row, routing }) => ({
      id: row.id,
      routing,
    })),
    needsReplySources: shared.map(({ row, routing }) => ({
      id: row.id,
      subject: row.subject,
      from: row.from,
      date: row.date,
      snippet: row.snippet,
      body_text: row.body_text || undefined,
      routing,
    })),
  };
}

function buildExport(rows: CachedMailRow[], appLanguage: string): RoutingDiagnosticsExport {
  const { routingResults } = buildSources(rows);
  const metadataById = Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        subject: row.subject,
        from: row.from,
        date: row.date,
      },
    ]),
  );

  return buildRoutingDiagnosticsExport({
    routingResults,
    metadataById,
    appLanguage,
  });
}

function buildNeedsReplyExport(rows: CachedMailRow[], appLanguage: string): NeedsReplyCandidateExport {
  const { needsReplySources } = buildSources(rows);
  return buildNeedsReplyCandidateExport({
    sources: needsReplySources,
    appLanguage,
  });
}

function buildGitHubSamplesExport(rows: CachedMailRow[]): GitHubSampleExport {
  const { routingResults } = buildSources(rows);
  const metadataById = Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        subject: row.subject,
        from: row.from,
        date: row.date,
      },
    ]),
  );

  return buildGitHubSampleExport({
    routingResults,
    metadataById,
  });
}

function writeExport(outPath: string, exportResult: RoutingDiagnosticsExport | NeedsReplyCandidateExport) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(exportResult, null, 2), 'utf8');
}

function logRoutingSummary(exportResult: RoutingDiagnosticsExport, outPath: string) {
  console.log(`Routing diagnostics exported to ${outPath}`);
  console.log(`Mail count: ${exportResult.mail_count}`);
  console.log('Folder counts:', exportResult.summary.folder_counts);
  console.log('Force-upgrade counts:', exportResult.summary.force_upgrade_reason_counts);
  console.log('Recommended depth counts:', exportResult.summary.recommended_depth_counts);
  console.log('GitHub event counts:', exportResult.summary.github_event_type_counts);
  console.log('Multi-priority overlaps:', exportResult.summary.multi_priority_bucket_hits.length);
}

function logNeedsReplySummary(exportResult: NeedsReplyCandidateExport, outPath: string) {
  console.log(`Needs Reply candidates exported to ${outPath}`);
  console.log(`Candidate count: ${exportResult.mail_count}`);
}

function logGitHubSampleSummary(exportResult: GitHubSampleExport, outPath: string) {
  console.log(`GitHub samples exported to ${outPath}`);
  console.log(`GitHub sample count: ${exportResult.mail_count}`);
  console.log('Folder counts:', exportResult.summary.folder_counts);
  console.log('Event counts:', exportResult.summary.event_counts);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = loadCachedMails(options.dbPath, options);
  if (options.mode === 'needs-reply') {
    const exportResult = buildNeedsReplyExport(rows, options.appLanguage);
    writeExport(options.outPath, exportResult);
    logNeedsReplySummary(exportResult, options.outPath);
    return;
  }

  if (options.mode === 'github-samples') {
    const exportResult = buildGitHubSamplesExport(rows);
    writeExport(options.outPath, exportResult);
    logGitHubSampleSummary(exportResult, options.outPath);
    return;
  }

  const exportResult = buildExport(rows, options.appLanguage);
  writeExport(options.outPath, exportResult);
  logRoutingSummary(exportResult, options.outPath);
}

main();
