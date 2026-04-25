import type {
  ActionView,
  EmailBodyBlock,
  EmailBodyBlocks,
  EmailLink,
  ParsedEmailMessage,
  ProfileView,
  ReplyView,
  SummaryView,
} from './types';
import {
  AMOUNT_PATTERN,
  collectMatches,
  DATE_PATTERN,
  EMAIL_PATTERN,
  extractLinks,
  ORDER_ID_PATTERN,
  PHONE_PATTERN,
  stringifyAddress,
  truncateText,
  uniqueStrings,
} from './utils';

function collectBlockText(blocks: EmailBodyBlock[]): string {
  return blocks.map((block) => block.text).join('\n\n').trim();
}

function collectLinksFromBlocks(blocks: EmailBodyBlock[]): EmailLink[] {
  return blocks.flatMap((block) => extractLinks(block.text));
}

function collectActionLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line))
    .filter((line) => /^(please|kindly|review|confirm|approve|pay|reply|todo|follow up|请|请于|需要|麻烦)/i.test(line));
}

/**
 * Build a concise summary-oriented view from parsed mail + semantic blocks.
 */
export function buildSummaryView(parsed: ParsedEmailMessage, blocks: EmailBodyBlocks): SummaryView {
  const latestReply = collectBlockText(blocks.latest_reply);
  const context = truncateText(collectBlockText(blocks.quoted_history), 1200);
  const bullets = latestReply
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    latestReply,
    context,
    bullets,
    links: uniqueLinks(parsed.links),
    attachments: parsed.attachments.map((attachment) => attachment.filename),
  };
}

function uniqueLinks(links: EmailLink[]): EmailLink[] {
  return links.filter((link, index, array) =>
    array.findIndex((item) => item.url === link.url && item.text === link.text) === index
  );
}

/**
 * Build an action-oriented view with deadlines, amounts, actionable lines and links.
 */
export function buildActionView(parsed: ParsedEmailMessage, blocks: EmailBodyBlocks): ActionView {
  const actionSource = [collectBlockText(blocks.latest_reply), collectBlockText(blocks.list), collectBlockText(blocks.table)]
    .filter(Boolean)
    .join('\n');

  return {
    latestReply: collectBlockText(blocks.latest_reply),
    actions: uniqueStrings(collectActionLines(actionSource)),
    deadlines: uniqueStrings(collectMatches(actionSource, DATE_PATTERN)),
    amounts: uniqueStrings(collectMatches(actionSource, AMOUNT_PATTERN)),
    links: uniqueLinks([
      ...parsed.links,
      ...collectLinksFromBlocks(blocks.latest_reply),
      ...collectLinksFromBlocks(blocks.link_list),
      ...extractLinks(parsed.plainText),
    ]),
  };
}

/**
 * Build a reply-oriented view that keeps latest reply separate from quoted history.
 */
export function buildReplyView(parsed: ParsedEmailMessage, blocks: EmailBodyBlocks): ReplyView {
  const sender = parsed.from[0] || null;
  return {
    latestReply: collectBlockText(blocks.latest_reply),
    quotedHistory: collectBlockText(blocks.quoted_history),
    sender,
    recipients: [...parsed.to, ...parsed.cc],
    references: parsed.references,
    suggestedOpening: sender?.name ? `Hi ${sender.name},` : sender?.address ? `Hi ${sender.address},` : 'Hi,',
  };
}

/**
 * Build a lightweight sender/contact profile from headers and signature text.
 */
export function buildProfileView(parsed: ParsedEmailMessage, blocks: EmailBodyBlocks): ProfileView {
  const sender = parsed.from[0] || { name: '', address: '' };
  const signature = collectBlockText(blocks.signature);
  const profileSource = [parsed.plainText, signature].filter(Boolean).join('\n');
  const domain = sender.address.includes('@') ? sender.address.split('@')[1] : '';
  const companies = uniqueStrings(
    [
      ...signature
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /(inc|ltd|llc|corp|team|财务|科技|有限公司|公司)/i.test(line)),
      domain ? domain.split('.')[0] : '',
    ].filter(Boolean)
  );

  return {
    sender: {
      name: sender.name,
      email: sender.address,
      domain,
    },
    contacts: uniqueStrings([...parsed.from, ...parsed.to, ...parsed.cc].map((item) => stringifyAddress(item))),
    companies,
    phones: uniqueStrings(collectMatches(profileSource, PHONE_PATTERN)),
    addresses: uniqueStrings(collectMatches(profileSource, /(?:地址[:：]\s*[^\n]+|Address[:：]?\s*[^\n]+|\d{1,5}\s+[A-Za-z0-9.\s]+(?:Street|St|Road|Rd|Avenue|Ave|Blvd|Lane|Ln|Drive|Dr)\b[^\n]*)/gi)),
    orderIds: uniqueStrings(collectMatches(profileSource, ORDER_ID_PATTERN)),
    signature,
  };
}
