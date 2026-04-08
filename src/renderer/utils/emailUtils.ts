// src/renderer/utils/emailUtils.ts
import type { MockEmail } from '../data/mockData';

export function sortEmailsByDate(emails: MockEmail[], descending: boolean = true): MockEmail[] {
  return [...emails].sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime();
    return descending ? diff : -diff;
  });
}

export function groupEmailsByDate(emails: MockEmail[]): Map<string, MockEmail[]> {
  const groups = new Map<string, MockEmail[]>();

  for (const email of emails) {
    const date = email.date;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = '昨天';
    } else if (date.getFullYear() === today.getFullYear()) {
      label = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    } else {
      label = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(email);
  }

  return groups;
}

export function filterEmailsByFolder(emails: MockEmail[], folder: string): MockEmail[] {
  if (folder === 'inbox') return emails;
  return emails.filter(e => e.folder === folder);
}

export function filterEmailsByAccount(emails: MockEmail[], accountId: number | null): MockEmail[] {
  if (accountId === null) return emails;
  return emails.filter(e => e.accountId === accountId);
}

export function searchEmails(emails: MockEmail[], query: string): MockEmail[] {
  if (!query.trim()) return emails;
  const lower = query.toLowerCase();
  return emails.filter(e =>
    e.subject.toLowerCase().includes(lower) ||
    e.from.name.toLowerCase().includes(lower) ||
    e.from.email.toLowerCase().includes(lower) ||
    e.snippet.toLowerCase().includes(lower)
  );
}
