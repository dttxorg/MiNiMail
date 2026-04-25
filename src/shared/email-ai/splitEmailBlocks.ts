import type { EmailBodyBlocks } from './types';
import {
  ADDRESS_PATTERN,
  appendBlock,
  AMOUNT_PATTERN,
  collectMatches,
  createEmptyBlocks,
  DISCLAIMER_PATTERNS,
  FOOTER_PATTERNS,
  makeBlock,
  ORDER_ID_PATTERN,
  PHONE_PATTERN,
  QUOTE_HEADER_PATTERNS,
  SIGNATURE_HINT_PATTERNS,
  URL_PATTERN,
} from './utils';

function isQuoteBoundary(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('>') || QUOTE_HEADER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isDisclaimerLine(line: string): boolean {
  return DISCLAIMER_PATTERNS.some((pattern) => pattern.test(line));
}

function isFooterLine(line: string): boolean {
  return FOOTER_PATTERNS.some((pattern) => pattern.test(line));
}

function isExplicitSignatureBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SIGNATURE_HINT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isSignatureTailLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (collectMatches(trimmed, PHONE_PATTERN).length > 0) return true;
  if (collectMatches(trimmed, ADDRESS_PATTERN).length > 0) return true;
  if (/@/.test(trimmed) && !/\s{2,}/.test(trimmed)) return true;
  if (/[|]/.test(trimmed) && trimmed.length < 80) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(trimmed)) return true;
  if (/^[\p{Script=Han}]{2,10}$/u.test(trimmed)) return true;
  if (
    trimmed.split(/\s+/).length <= 4
    && /(team|dept|department|support|sales|finance|operations|group|inc|llc|ltd|corp|company|studio|lab|labs|technologies|technology|solutions|business|service|services|team|鍥㈤槦|閮ㄩ棬|鍏徃|鏀寔|璐㈠姟)/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function findSignatureStart(lines: string[], endExclusive: number): number {
  const tailCandidates: number[] = [];

  for (let index = endExclusive - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (tailCandidates.length > 0) break;
      continue;
    }

    if (isExplicitSignatureBoundary(trimmed)) {
      return index;
    }

    if (isSignatureTailLine(trimmed)) {
      tailCandidates.unshift(index);
      continue;
    }

    if (tailCandidates.length >= 2) {
      return tailCandidates[0];
    }

    break;
  }

  return -1;
}

function classifyLine(line: string): keyof EmailBodyBlocks {
  const trimmed = line.trim();
  if (!trimmed) return 'noise';
  if (collectMatches(trimmed, URL_PATTERN).length > 0 && trimmed.replace(cloneLineUrlPattern(), '').trim().length < 32) return 'link_list';
  if (/^(\*|-|•|\d+[.)])\s+/.test(trimmed)) return 'list';
  if ((trimmed.match(/\|/g) || []).length >= 2) return 'table';
  if (/^```/.test(trimmed) || /^\s{4,}/.test(line) || /[{};]{2,}/.test(trimmed)) return 'code';
  if (/^[=_-]{12,}$/.test(trimmed) || (collectMatches(trimmed, URL_PATTERN).length === 0 && trimmed.replace(/[A-Za-z0-9]/g, '').length > trimmed.length * 0.7)) return 'noise';
  return 'latest_reply';
}

function cloneLineUrlPattern(): RegExp {
  return new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
}

function flushGroup(blocks: EmailBodyBlocks, type: keyof EmailBodyBlocks, buffer: string[], startLine: number): void {
  appendBlock(blocks, type, buffer, startLine);
}

/**
 * Split normalized plain text into semantic blocks that downstream AI tasks can reuse.
 *
 * Example:
 * splitEmailBlocks('Thanks\\n\\nOn Fri, Alice wrote:\\n> quoted')
 * -> latest_reply: ['Thanks'], quoted_history: ['On Fri...']
 */
export function splitEmailBlocks(plainText: string): EmailBodyBlocks {
  const blocks = createEmptyBlocks();
  const lines = plainText.replace(/\r\n/g, '\n').split('\n');
  const quoteStart = lines.findIndex((line) => isQuoteBoundary(line));

  const latestLines = quoteStart >= 0 ? lines.slice(0, quoteStart) : lines.slice();
  const quotedLines = quoteStart >= 0 ? lines.slice(quoteStart) : [];

  if (quotedLines.length > 0) {
    appendBlock(blocks, 'quoted_history', quotedLines, quoteStart + 1);
  }

  let workingLatest = latestLines.slice();

  let disclaimerStart = -1;
  let footerStart = -1;

  for (let index = workingLatest.length - 1; index >= 0; index -= 1) {
    const line = workingLatest[index].trim();
    if (!line) continue;

    if (footerStart === -1 && isFooterLine(line)) {
      footerStart = index;
      continue;
    }

    if (disclaimerStart === -1 && isDisclaimerLine(line)) {
      disclaimerStart = index;
      continue;
    }
    if (disclaimerStart !== -1 || footerStart !== -1) break;
  }

  const signatureSearchEnd = [disclaimerStart, footerStart]
    .filter((value) => value >= 0)
    .reduce((min, value) => Math.min(min, value), workingLatest.length);
  const signatureStart = findSignatureStart(workingLatest, signatureSearchEnd);

  const cutIndexCandidates = [signatureStart, disclaimerStart, footerStart].filter((value) => value >= 0);
  const latestContentEnd = cutIndexCandidates.length > 0 ? Math.min(...cutIndexCandidates) : workingLatest.length;
  const latestContent = workingLatest.slice(0, latestContentEnd);

  if (signatureStart >= 0) {
    const end = disclaimerStart >= 0 ? disclaimerStart : footerStart >= 0 ? footerStart : workingLatest.length;
    appendBlock(blocks, 'signature', workingLatest.slice(signatureStart, end), signatureStart + 1);
  }
  if (disclaimerStart >= 0) {
    const end = footerStart >= 0 ? footerStart : workingLatest.length;
    appendBlock(blocks, 'disclaimer', workingLatest.slice(disclaimerStart, end), disclaimerStart + 1);
  }
  if (footerStart >= 0) {
    appendBlock(blocks, 'footer', workingLatest.slice(footerStart), footerStart + 1);
  }

  let activeType: keyof EmailBodyBlocks | null = null;
  let activeStart = 1;
  let activeBuffer: string[] = [];

  const flushActive = () => {
    if (!activeType) return;
    flushGroup(blocks, activeType, activeBuffer, activeStart);
    activeType = null;
    activeBuffer = [];
  };

  latestContent.forEach((line, index) => {
    const type = classifyLine(line);
    if (activeType !== type) {
      flushActive();
      activeType = type;
      activeStart = index + 1;
    }
    activeBuffer.push(line);
  });
  flushActive();

  if (blocks.latest_reply.length === 0) {
    const fallbackBlock = makeBlock('latest_reply', latestContent, 1);
    if (fallbackBlock) blocks.latest_reply.push(fallbackBlock);
  }

  return blocks;
}
