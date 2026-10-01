import { redactSensitiveEntities } from '../redactSensitiveEntities';
import { getNoulAnswer } from './client';
import type {
  JevAsker,
  JevQuestions,
  JevThreadCompactionResult,
  JevThreadMailInput,
  JevThreadTurnDecision,
} from './types';

export interface ThreadCompactionOptions {
  /** Minimum keep probability for an older email turn to stay (default: 0.5) */
  keepThreshold?: number;
  /** Number of latest emails to always preserve (default: 2) */
  preserveRecentMails?: number;
}

export function stripEmailQuotes(text: string): string {
  return text
    .replace(/^On .*? wrote:[\s\S]*/im, '')
    .replace(/^在.*?写道[：:][\s\S]*/im, '')
    .replace(/^-{3,}\s*(Original Message|原始邮件)\s*-{3,}[\s\S]*/im, '')
    .replace(/^发件人[\s\S]*?(收件人|发送时间)[\s\S]*/im, '')
    .trim();
}

function extractActionDetail(m: JevThreadMailInput): string {
  const rawText = stripEmailQuotes(m.bodyText || m.snippet || '').trim();
  if (!rawText) return m.subject || '(no details)';

  // Prefer actionable phrases or sentences from the actual message (excluding quoted reply history)
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 5);
  const actionLine = lines.find((line) =>
    /(?:please|could you|action|todo|follow[- ]up|will |plan to|commit|deadline|review|请|麻烦|跟进|待办|预计|计划|承诺|确认|回复|评审)/i.test(line)
  );

  if (actionLine) {
    return actionLine.slice(0, 120);
  }
  return (lines[0] || m.snippet || m.subject).slice(0, 100);
}

/**
 * Builds the state representation for a thread compaction request.
 * Removes boilerplate quotes, strips redundant signatures, and redacts sensitive data.
 */
export function buildThreadCompactionState(
  threadId: string,
  mails: JevThreadMailInput[],
): Record<string, unknown> {
  const participants = Array.from(
    new Set(mails.map((m) => redactSensitiveEntities(m.from || '').redactedText).filter(Boolean))
  );
  const latestSubject = mails[mails.length - 1]?.subject || mails[0]?.subject || '(no subject)';

  const turns = mails.map((m, index) => {
    const cleanBody = stripEmailQuotes(m.bodyText || m.snippet || '');

    const redacted = redactSensitiveEntities(cleanBody).redactedText.slice(0, 1000);
    const cleanFrom = redactSensitiveEntities(m.from || '').redactedText;

    return {
      index: index + 1,
      id: m.id,
      from: cleanFrom,
      date: m.date,
      preview: redacted,
    };
  });

  return {
    thread: {
      threadId,
      subject: redactSensitiveEntities(latestSubject).redactedText,
      participants,
      totalMails: mails.length,
      turns,
    },
    goal: 'Identify the critical decision path, unclosed tasks (open loops), and explicit commitments across this conversation, pruning trivial conversational chatter.',
  };
}

/**
 * Builds the Jev questions for candidate email turns in the thread.
 */
export function buildThreadQuestions(
  olderMails: JevThreadMailInput[],
  recentMails: JevThreadMailInput[] = [],
): JevQuestions {
  const questions: JevQuestions = {};

  for (const mail of olderMails) {
    questions[`keep_${mail.id}`] = {
      type: 'noul',
      instructions: `Email ${mail.id} contains pivotal decisions, essential requirements, or substantive context that cannot be omitted from the thread narrative:`,
      criteria: {
        true: 'Substantive contribution: requirement change, approval, project blocker, technical decision, contract terms',
        false: 'Superficial chatter: pure acknowledgment ("Thanks", "Got it"), out-of-office autoreply, or already superseded inquiry',
      },
    };

    questions[`loop_${mail.id}`] = {
      type: 'noul',
      instructions: `Email ${mail.id} raised an open question, pending approval, or uncompleted action item that still needs resolution:`,
    };

    questions[`commit_${mail.id}`] = {
      type: 'noul',
      instructions: `The sender of email ${mail.id} made an explicit promise, milestone commitment, or delivered an agreed work item:`,
    };
  }

  for (const mail of recentMails) {
    questions[`loop_${mail.id}`] = {
      type: 'noul',
      instructions: `Email ${mail.id} raised an open question, pending approval, or uncompleted action item that still needs resolution:`,
    };

    questions[`commit_${mail.id}`] = {
      type: 'noul',
      instructions: `The sender of email ${mail.id} made an explicit promise, milestone commitment, or delivered an agreed work item:`,
    };
  }

  return questions;
}

/**
 * Prunes noise and structures the key lineage of a multi-turn email thread using Jev.
 */
export async function compactThreadWithJev(
  asker: JevAsker,
  threadId: string,
  mails: JevThreadMailInput[],
  options?: ThreadCompactionOptions,
): Promise<JevThreadCompactionResult> {
  const keepThreshold = options?.keepThreshold ?? 0.5;
  const preserveRecent = Math.max(1, options?.preserveRecentMails ?? 2);

  if (mails.length === 0) {
    return {
      threadId,
      originalMailCount: 0,
      keptMailCount: 0,
      decisions: [],
      compactedTimeline: [],
      openLoops: [],
      commitments: [],
    };
  }

  const splitIndex = Math.max(0, mails.length - preserveRecent);
  const olderMails = mails.slice(0, splitIndex);
  const recentMails = mails.slice(splitIndex);

  const state = buildThreadCompactionState(threadId, mails);
  const questions = buildThreadQuestions(olderMails, recentMails);

  const response = await asker.ask(state, questions);
  const answers = response.answers || {};

  const decisions: JevThreadTurnDecision[] = [];
  const openLoops: string[] = [];
  const commitments: string[] = [];

  // Evaluate older turns
  for (const m of olderMails) {
    const keepProb = getNoulAnswer(answers, `keep_${m.id}`);
    const loopProb = getNoulAnswer(answers, `loop_${m.id}`);
    const commitProb = getNoulAnswer(answers, `commit_${m.id}`);

    const hasOpenLoops = loopProb >= 0.55;
    const hasCommitments = commitProb >= 0.55;
    const kept = keepProb >= keepThreshold || hasOpenLoops || hasCommitments;

    decisions.push({
      mailId: m.id,
      from: m.from,
      date: m.date,
      subject: m.subject,
      keepProbability: keepProb,
      kept,
      hasOpenLoops,
      hasCommitments,
      reason: kept ? 'informative' : 'redundant_chatter',
    });

    const localSender = m.from || 'unknown';
    const detail = extractActionDetail(m);
    const topicPrefix = m.subject ? `[${m.subject.slice(0, 40)}] ` : '';
    if (hasOpenLoops) {
      openLoops.push(`[Jev:Loop] [${localSender} (${m.date.slice(0, 10)})]: Follow-up item raised in ${topicPrefix}"${detail}"`);
    }
    if (hasCommitments) {
      commitments.push(`[Jev:Commit] [${localSender} (${m.date.slice(0, 10)})]: Commitment stated in ${topicPrefix}"${detail}"`);
    }
  }
  // Preserve recent turns while evaluating their open loops and commitments
  for (const m of recentMails) {
    const loopProb = getNoulAnswer(answers, `loop_${m.id}`);
    const commitProb = getNoulAnswer(answers, `commit_${m.id}`);

    const hasOpenLoops = loopProb >= 0.55;
    const hasCommitments = commitProb >= 0.55;

    decisions.push({
      mailId: m.id,
      from: m.from,
      date: m.date,
      subject: m.subject,
      keepProbability: 1.0,
      kept: true,
      hasOpenLoops,
      hasCommitments,
      reason: 'preserved_recent',
    });

    const localSender = m.from || 'unknown';
    const detail = extractActionDetail(m);
    const topicPrefix = m.subject ? `[${m.subject.slice(0, 40)}] ` : '';
    if (hasOpenLoops) {
      openLoops.push(`[Jev:Loop] [${localSender} (${m.date.slice(0, 10)})]: Follow-up item raised in ${topicPrefix}"${detail}"`);
    }
    if (hasCommitments) {
      commitments.push(`[Jev:Commit] [${localSender} (${m.date.slice(0, 10)})]: Commitment stated in ${topicPrefix}"${detail}"`);
    }
  }
  const compactedTimeline = decisions
    .filter((d) => d.kept)
    .map((d) => {
      const original = mails.find((m) => m.id === d.mailId);
      return {
        mailId: d.mailId,
        from: d.from,
        date: d.date,
        summaryHint: original?.snippet || d.subject || '',
      };
    });

  return {
    threadId,
    originalMailCount: mails.length,
    keptMailCount: compactedTimeline.length,
    decisions,
    compactedTimeline,
    openLoops,
    commitments,
  };
}
