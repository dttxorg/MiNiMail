type SearchableMail = {
  subject: string;
  from: string;
  fromName?: string;
  snippet?: string;
  bodyText?: string;
  bodyHtml?: string;
  _bodyText?: string;
  _bodyHtml?: string;
};

export type MailSearchMatchField = 'subject' | 'from' | 'snippet' | 'body' | null;

export interface MailSearchMatchPreview {
  field: MailSearchMatchField;
  text: string;
  matchStart: number;
  matchEnd: number;
}

function stripHtmlForSearch(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBodySearchText(mail: SearchableMail): string {
  return mail.bodyText || mail._bodyText || stripHtmlForSearch(mail.bodyHtml || mail._bodyHtml || '');
}

function findNormalizedMatch(source: string, normalizedQuery: string): { start: number; end: number } | null {
  const normalizedSource = source.toLowerCase();
  const matchStart = normalizedSource.indexOf(normalizedQuery);
  if (matchStart === -1) {
    return null;
  }

  return {
    start: matchStart,
    end: matchStart + normalizedQuery.length,
  };
}

function buildBodyPreview(source: string, matchStart: number, matchEnd: number): MailSearchMatchPreview {
  const previewRadius = 42;
  const rawStart = Math.max(0, matchStart - previewRadius);
  const rawEnd = Math.min(source.length, matchEnd + previewRadius);
  const prefix = rawStart > 0 ? '…' : '';
  const suffix = rawEnd < source.length ? '…' : '';
  const sliced = source.slice(rawStart, rawEnd).trim();
  const text = `${prefix}${sliced}${suffix}`;
  const offset = prefix.length;

  return {
    field: 'body',
    text,
    matchStart: offset + (matchStart - rawStart),
    matchEnd: offset + (matchEnd - rawStart),
  };
}

export function getMailSearchMatchPreview(mail: SearchableMail, query: string): MailSearchMatchPreview | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const subject = mail.subject || '';
  const from = mail.fromName || mail.from || '';
  const snippet = mail.snippet || '';
  const body = getBodySearchText(mail);

  const orderedFields: Array<{ field: Exclude<MailSearchMatchField, null>; value: string }> = [
    { field: 'subject', value: subject },
    { field: 'from', value: from },
    { field: 'snippet', value: snippet },
    { field: 'body', value: body },
  ];

  for (const entry of orderedFields) {
    if (!entry.value) continue;
    const match = findNormalizedMatch(entry.value, normalizedQuery);
    if (!match) continue;

    if (entry.field === 'body') {
      return buildBodyPreview(entry.value, match.start, match.end);
    }

    return {
      field: entry.field,
      text: entry.value,
      matchStart: match.start,
      matchEnd: match.end,
    };
  }

  return null;
}

export function filterMailsBySearchQuery<T extends SearchableMail>(mails: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return mails;
  }

  return mails.filter((mail) => getMailSearchMatchPreview(mail, normalizedQuery) !== null);
}
