import type { RendererMailDetail, RendererMailSummary } from '../hooks/useMail';
import type { MailRoutingResultEntry } from './mailRoutingAdapter';

interface ClearMailScanStateArgs {
  mailList: RendererMailSummary[];
  currentMail: RendererMailDetail | null;
  routingResults: MailRoutingResultEntry[];
  targetMailId: string;
}

interface ClearMailScanStateResult {
  mailList: RendererMailSummary[];
  currentMail: RendererMailDetail | null;
  routingResults: MailRoutingResultEntry[];
}

function clearMailScanFields<T extends { id: string; category?: string; isScanned?: boolean; scanResult?: string }>(
  mail: T,
  targetMailId: string,
): T {
  if (mail.id !== targetMailId) {
    return mail;
  }

  return {
    ...mail,
    category: undefined,
    isScanned: false,
    scanResult: undefined,
  };
}

export function clearMailScanState({
  mailList,
  currentMail,
  routingResults,
  targetMailId,
}: ClearMailScanStateArgs): ClearMailScanStateResult {
  return {
    mailList: mailList.map((mail) => clearMailScanFields(mail, targetMailId)),
    currentMail: currentMail ? clearMailScanFields(currentMail, targetMailId) : null,
    routingResults: routingResults.filter((entry) => entry.id !== targetMailId),
  };
}
