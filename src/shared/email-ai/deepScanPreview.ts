import { buildEmailAiSnapshot, type MailLikeForAi } from './fromBodies';
import { truncateText } from './utils';

export function buildDeepScanPreview(mail: MailLikeForAi): string {
  const snapshot = buildEmailAiSnapshot(mail);

  const sections = [
    snapshot.summaryView.latestReply ? `Latest reply:\n${snapshot.summaryView.latestReply}` : '',
    snapshot.actionView.actions.length > 0 ? `Actions:\n${snapshot.actionView.actions.join('\n')}` : '',
    snapshot.actionView.deadlines.length > 0 ? `Deadlines:\n${snapshot.actionView.deadlines.join('\n')}` : '',
    snapshot.actionView.amounts.length > 0 ? `Amounts:\n${snapshot.actionView.amounts.join('\n')}` : '',
    snapshot.replyView.suggestedOpening ? `Reply suggestion:\n${snapshot.replyView.suggestedOpening}` : '',
    snapshot.replyView.quotedHistory ? `Quoted history:\n${truncateText(snapshot.replyView.quotedHistory, 400)}` : '',
    snapshot.parsed.plainText ? `Body preview:\n${truncateText(snapshot.parsed.plainText, 800)}` : '',
  ].filter(Boolean);

  return truncateText(sections.join('\n\n'), 1600);
}
