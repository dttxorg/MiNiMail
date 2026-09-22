import type {
  ChoiceAnswer,
  JevAnswer,
  JevAsker,
  JevQuestions,
  JevResponse,
  JevSettings,
  JevState,
  NoulAnswer,
  ScoreAnswer,
} from './types';

export const SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';

export interface JevRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/**
 * Builds the HTTP request for a TypeSafe Jev call.
 */
export function buildJevRequest(
  params: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
  },
  state: JevState,
  questions: JevQuestions,
): JevRequest {
  return {
    url: params.baseUrl || SYSTEM_ONE_URL,
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_MODEL,
      state,
      questions,
    }),
  };
}

/**
 * Validates and parses a raw Jev response body.
 */
export function parseJevResponse(
  status: number,
  ok: boolean,
  text: string,
): JevResponse {
  if (!ok) {
    throw new Error(`Jev request failed (${status}): ${text.slice(0, 300)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Jev returned malformed JSON');
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('answers' in parsed) ||
    parsed.answers === null ||
    typeof parsed.answers !== 'object'
  ) {
    throw new Error('Jev response is missing answers dictionary');
  }
  return parsed as JevResponse;
}

/**
 * Safely extracts a noul (boolean probability) answer.
 */
export function getNoulAnswer(
  answers: Record<string, JevAnswer>,
  name: string,
): number {
  const ans = answers[name] as NoulAnswer | undefined;
  if (!ans || typeof ans.noul !== 'number' || !Number.isFinite(ans.noul)) {
    return 0.5; // Neutral fallback
  }
  return Math.max(0, Math.min(1, ans.noul));
}

/**
 * Safely extracts a choice answer.
 */
export function getChoiceAnswer(
  answers: Record<string, JevAnswer>,
  name: string,
  fallbackChoice: string,
): { choice: string; confidence: number } {
  const ans = answers[name] as ChoiceAnswer | undefined;
  if (!ans || typeof ans.choice !== 'string') {
    return { choice: fallbackChoice, confidence: 0 };
  }
  const conf = typeof ans.confidence === 'number' && Number.isFinite(ans.confidence)
    ? Math.max(0, Math.min(1, ans.confidence))
    : 0.5;
  return { choice: ans.choice, confidence: conf };
}

/**
 * Safely extracts a score answer.
 */
export function getScoreAnswer(
  answers: Record<string, JevAnswer>,
  name: string,
  fallbackScore = 50,
): { score: number; confidence: number } {
  const ans = answers[name] as ScoreAnswer | undefined;
  if (!ans || typeof ans.score !== 'number' || !Number.isFinite(ans.score)) {
    return { score: fallbackScore, confidence: 0 };
  }
  const conf = typeof ans.confidence === 'number' && Number.isFinite(ans.confidence)
    ? Math.max(0, Math.min(1, ans.confidence))
    : 0.5;
  return { score: Math.max(0, Math.min(100, Math.round(ans.score))), confidence: conf };
}

/**
 * Standard fetch-based JevAsker implementation.
 */
export class FetchJevClient implements JevAsker {
  private settings: Pick<JevSettings, 'apiKey' | 'baseUrl' | 'model'>;
  constructor(settings: Pick<JevSettings, 'apiKey' | 'baseUrl' | 'model'>) {
    this.settings = settings;
  }
  async ask(state: JevState, questions: JevQuestions): Promise<JevResponse> {
    if (!this.settings.apiKey) {
      throw new Error('Jev API key is not configured');
    }
    const req = buildJevRequest(
      {
        apiKey: this.settings.apiKey,
        baseUrl: this.settings.baseUrl,
        model: this.settings.model,
      },
      state,
      questions,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    try {
      const resp = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      const text = await resp.text();
      return parseJevResponse(resp.status, resp.ok, text);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
