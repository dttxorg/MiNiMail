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

/**
 * Builds the state representation for a thread compaction request.
 * Removes boilerplate quotes, strips redundant signatures, and redacts sensitive data.
 */
export function buildThreadCompactionState(
  threadId: string,
  mails: JevThreadMailInput[],
): Record<string, unknown> {
  const participants = Array.from(new Set(mails.map((m) => m.from).filter(Boolean)));
  const latestSubject = mails[mails.length - 1]?.subject || mails[0]?.subject || '(no subject)';

  const turns = mails.map((m, index) => {
    const cleanBody = (m.bodyText || m.snippet || '')
      // Remove common quote headers
      .replace(/^On .*? wrote:[\s\S]*/im, '')
      .replace(/^-{3,} Original Message -{3,}[\s\S]*/im, '')
      .trim();

    const redacted = redactSensitiveEntities(cleanBody).redactedText.slice(0, 1000);

    return {
      index: index + 1,
      id: m.id,
      from: m.from,
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
export function buildThreadQuestions(candidateMails: JevThreadMailInput[]): JevQuestions {
  const questions: JevQuestions = {};

  for (const mail of candidateMails) {
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

  // If the thread is very short (<= preserveRecent), all are kept by default
  if (mails.length <= preserveRecent) {
    const decisions: JevThreadTurnDecision[] = mails.map((m) => ({
      mailId: m.id,
      from: m.from,
      date: m.date,
      subject: m.subject,
      keepProbability: 1.0,
      kept: true,
      hasOpenLoops: false,
      hasCommitments: false,
      reason: 'preserved_recent',
    }));

    return {
      threadId,
      originalMailCount: mails.length,
      keptMailCount: mails.length,
      decisions,
      compactedTimeline: mails.map((m) => ({
        mailId: m.id,
        from: m.from,
        date: m.date,
        summaryHint: m.subject || m.snippet || '',
      })),
      openLoops: [],
      commitments: [],
    };
  }

  const splitIndex = mails.length - preserveRecent;
  const olderMails = mails.slice(0, splitIndex);
  const recentMails = mails.slice(splitIndex);

  const state = buildThreadCompactionState(threadId, mails);
  const questions = buildThreadQuestions(olderMails);

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

    if (hasOpenLoops) {
      openLoops.push(`[${m.from} (${m.date.slice(0, 10)})]: Follow-up item raised in "${m.subject || m.snippet?.slice(0, 60)}"`);
    }
    if (hasCommitments) {
      commitments.push(`[${m.from} (${m.date.slice(0, 10)})]: Commitment stated in "${m.subject || m.snippet?.slice(0, 60)}"`);
    }
  }

  // Preserve recent turns
  for (const m of recentMails) {
    decisions.push({
      mailId: m.id,
      from: m.from,
      date: m.date,
      subject: m.subject,
      keepProbability: 1.0,
      kept: true,
      hasOpenLoops: false,
      hasCommitments: false,
      reason: 'preserved_recent',
    });
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
