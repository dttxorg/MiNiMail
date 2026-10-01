import { redactSensitiveEntities } from '../redactSensitiveEntities';
import { getChoiceAnswer, getNoulAnswer, getScoreAnswer } from './client';
import {
  JEV_EMAIL_CATEGORIES,
  JEV_PRIORITY_LEVELS,
  type JevAsker,
  type JevEmailCategory,
  type JevMailClassification,
  type JevPriorityLevel,
  type JevQuestions,
  type JevSettings,
} from './types';

export interface EmailClassifyInput {
  id: string;
  subject: string;
  from: string;
  fromName?: string;
  snippet?: string;
  bodyText?: string;
  hasAttachment?: boolean;
}

/**
 * Builds the typed questions for email triage and categorization.
 */
export function buildTriageQuestions(mailId: string): JevQuestions {
  return {
    [`category_${mailId}`]: {
      type: 'choice',
      instructions: `Select the primary category that best describes email ${mailId}.`,
      criteria: {
        inbox: 'Important human correspondence, client discussion, direct inquiry, or active project work',
        newsletter: 'Informational newsletter, curated digest, industry article, or promotional content subscribed to',
        transactional: 'Invoices, receipts, purchase receipts, OTP verification codes, bank statements, order updates',
        notification: 'Automated machine notices, GitHub PRs/issues, CI/CD alerts, calendar meeting updates',
        risk: 'Security warnings, suspicious login alerts, payment failure warnings, potential phishing',
        spam: 'Unsolicited advertising, bulk commercial pitches, low-relevance marketing spam',
      },
    },
    [`priority_${mailId}`]: {
      type: 'choice',
      instructions: `Determine the triage priority for email ${mailId}.`,
      criteria: {
        high: 'Requires immediate attention, tight deadline, critical blocker, or VIP client',
        normal: 'Standard everyday communication, routine task, or informational update',
        low: 'Can be read later or archived, automated report, newsletter, or non-urgent broadcast',
      },
    },
    [`action_${mailId}`]: {
      type: 'noul',
      instructions: `Does email ${mailId} explicitly ask the recipient for an action, decision, review, or reply?`,
      criteria: {
        true: 'Explicit request for action, decision, sign-off, or answer',
        false: 'Purely informational, automated status broadcast, or no action requested',
      },
    },
    [`urgency_${mailId}`]: {
      type: 'score',
      instructions: `Rate the urgency of email ${mailId} on a scale from 0 (completely non-urgent) to 100 (drop everything and act immediately).`,
      criteria: [
        '0-25: Informational, digest, newsletter, routine notice',
        '26-50: Normal correspondence, no tight deadline mentioned',
        '51-75: Action requested within a few days or needs review soon',
        '76-100: Due today, blocking an active project, critical emergency or payment dispute',
      ],
    },
  };
}

/**
 * Prepares the sanitized/redacted state for Jev email triage.
 */
export function buildClassifyState(input: EmailClassifyInput): Record<string, unknown> {
  // Redact sender, subject and snippet safely
  const redactedFrom = redactSensitiveEntities(input.from || '').redactedText;
  const redactedFromName = redactSensitiveEntities(input.fromName || '').redactedText;
  const redactedSubject = redactSensitiveEntities(input.subject || '').redactedText;
  const redactedSnippet = redactSensitiveEntities(input.snippet || input.bodyText || '').redactedText.slice(0, 1500);

  return {
    email: {
      id: input.id,
      from: redactedFrom,
      fromName: redactedFromName,
      subject: redactedSubject,
      snippet: redactedSnippet,
      hasAttachment: Boolean(input.hasAttachment),
    },
  };
}

/**
 * Classifies a single email using Jev.
 */
export async function classifyMailWithJev(
  asker: JevAsker,
  input: EmailClassifyInput,
  options?: { confidenceThreshold?: number },
): Promise<JevMailClassification> {
  const threshold = options?.confidenceThreshold ?? 0.8;
  const state = buildClassifyState(input);
  const questions = buildTriageQuestions(input.id);

  const response = await asker.ask(state, questions);
  const answers = response.answers || {};

  const catAnswer = getChoiceAnswer(answers, `category_${input.id}`, 'inbox');
  const priAnswer = getChoiceAnswer(answers, `priority_${input.id}`, 'normal');
  const actionProb = getNoulAnswer(answers, `action_${input.id}`);
  const urgAnswer = getScoreAnswer(answers, `urgency_${input.id}`, 30);

  const isHighConfidence = catAnswer.confidence >= threshold && priAnswer.confidence >= threshold;

  const validatedCategory: JevEmailCategory = JEV_EMAIL_CATEGORIES.includes(catAnswer.choice as JevEmailCategory)
    ? (catAnswer.choice as JevEmailCategory)
    : 'inbox';
  const validatedPriority: JevPriorityLevel = JEV_PRIORITY_LEVELS.includes(priAnswer.choice as JevPriorityLevel)
    ? (priAnswer.choice as JevPriorityLevel)
    : 'normal';

  return {
    mailId: input.id,
    category: validatedCategory,
    categoryConfidence: catAnswer.confidence,
    priority: validatedPriority,
    priorityConfidence: priAnswer.confidence,
    actionRequired: actionProb >= 0.5,
    actionRequiredProbability: actionProb,
    urgencyScore: urgAnswer.score,
    urgencyConfidence: urgAnswer.confidence,
    isHighConfidence,
  };
}
