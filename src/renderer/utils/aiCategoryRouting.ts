import type { RendererMailSummary } from '../hooks/useMail';
import type { MailRoutingAdapterResult } from './mailRoutingAdapter';
import { excludeGithubRoutedMails } from './mailRoutingAdapter';

export function getAiCategorySourceEmails(
  mails: RendererMailSummary[],
  routingAdapter: MailRoutingAdapterResult,
  githubNotificationsViewEnabled: boolean,
): RendererMailSummary[] {
  return githubNotificationsViewEnabled
    ? excludeGithubRoutedMails(mails, routingAdapter)
    : mails;
}
