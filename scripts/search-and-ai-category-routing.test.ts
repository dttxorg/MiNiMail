import { shouldCloseSearchAfterMailSelect } from '../src/renderer/utils/searchActions';
import { getAiCategorySourceEmails } from '../src/renderer/utils/aiCategoryRouting';
import { buildMailRoutingAdapter, type MailRoutingResultEntry } from '../src/renderer/utils/mailRoutingAdapter';

type Mail = {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
  category?: string;
  bodyText?: string;
  bodyHtml?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeMail(overrides: Partial<Mail>): Mail {
  return {
    id: 'mail-1',
    uid: 1,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'me@example.com',
    subject: 'Hello',
    date: new Date('2026-04-20T10:00:00Z'),
    snippet: 'hello',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'INBOX',
    accountId: 1,
    ...overrides,
  };
}

function testSearchClosesOnlyAfterNormalMailSelection() {
  assert(
    shouldCloseSearchAfterMailSelect({ isCtrlKey: false, isShiftKey: false }),
    '普通点击邮件后应关闭搜索框'
  );
  assert(
    !shouldCloseSearchAfterMailSelect({ isCtrlKey: true, isShiftKey: false }),
    'Ctrl 或 Cmd 多选时不应关闭搜索框'
  );
  assert(
    !shouldCloseSearchAfterMailSelect({ isCtrlKey: false, isShiftKey: true }),
    'Shift 范围选择时不应关闭搜索框'
  );
}

function testGithubMailsReturnToAiCategoriesWhenGithubViewDisabled() {
  const githubMail = makeMail({
    id: 'gh-1',
    from: 'notifications@github.com',
    fromName: 'GitHub',
    subject: '[openai/codex] Review requested (#42)',
    snippet: 'alice requested your review',
  });
  const normalMail = makeMail({
    id: 'mail-2',
    from: 'newsletter@example.com',
    subject: 'Weekly digest',
    snippet: 'Top stories this week',
  });

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: githubMail.id,
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 60,
          urgency_score: 40,
          actionability_score: 78,
          risk_score: 12,
          density_score: 42,
          relationship_score: 18,
          total_light_score: 58,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['review_requested'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'openai',
          repository_name: 'codex',
          repository_full_name: 'openai/codex',
          entity_type: 'pull_request',
          event_type: 'review_requested',
          entity_number: 42,
          entity_title: 'Improve triage',
          thread_key: 'github:openai/codex:pull_request:42',
          short_summary: 'alice requested your review',
          newest_content: 'Please review this pull request',
          needs_user_action: true,
          priority_score: 82,
          todo_items: ['Review the PR'],
          reply_caution: 'Email reply goes to conversation only',
          reasons: ['review_requested'],
        },
        smart_folder: {
          family: 'github',
          folder: 'GitHub/Review Requests',
          reasons: ['review_requested'],
        },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({
    mails: [githubMail, normalMail],
    routingResults,
    accountEmails: ['me@example.com'],
  });

  const disabledSource = getAiCategorySourceEmails([githubMail, normalMail], adapter, false);
  const enabledSource = getAiCategorySourceEmails([githubMail, normalMail], adapter, true);

  assert(
    disabledSource.some((mail) => mail.id === githubMail.id),
    '关闭 GitHub 开关后，GitHub 邮件应重新出现在 AI 分类数据源里'
  );
  assert(
    !enabledSource.some((mail) => mail.id === githubMail.id),
    '开启 GitHub 开关后，GitHub 邮件应继续从 AI 分类数据源中排除'
  );
  assert(
    enabledSource.some((mail) => mail.id === normalMail.id),
    '普通邮件不应受 GitHub 开关影响'
  );
}

testSearchClosesOnlyAfterNormalMailSelection();
testGithubMailsReturnToAiCategoriesWhenGithubViewDisabled();

console.log('search-and-ai-category-routing tests passed');
