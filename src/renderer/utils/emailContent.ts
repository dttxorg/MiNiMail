import { buildEmailAiSnapshot as buildSharedEmailAiSnapshot, type MailLikeForAi } from '../../shared/email-ai/fromBodies';

type MailEmail = MailLikeForAi & {
  fromName?: string;
  date: Date;
  snippet: string;
};

interface ExtractOptions {
  includeHeaders?: boolean;
  stripUrls?: boolean;
}

function removeStandaloneUrls(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\/\S+$/i.test(line))
    .map((line) => line.replace(/https?:\/\/\S+/gi, '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function buildMailAiSnapshot(email: MailEmail) {
  return buildSharedEmailAiSnapshot(email);
}

export function extractReadableEmailText(email: MailEmail, options: ExtractOptions = {}): string {
  const { includeHeaders = false, stripUrls = true } = options;
  const snapshot = buildMailAiSnapshot(email);
  const primarySections = [
    snapshot.summaryView.latestReply,
    snapshot.actionView.actions.join('\n'),
    snapshot.actionView.deadlines.join('\n'),
    snapshot.actionView.amounts.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const body = stripUrls ? removeStandaloneUrls(primarySections || snapshot.parsed.plainText) : (primarySections || snapshot.parsed.plainText);

  if (!includeHeaders) {
    return body || email.subject;
  }

  const headers = [
    `Subject: ${email.subject}`,
    `From: ${email.fromName || email.from} <${email.from}>`,
    `Date: ${email.date.toISOString()}`,
  ];

  return [...headers, '', body || email.subject]
    .filter(Boolean)
    .join('\n')
    .trim();
}
