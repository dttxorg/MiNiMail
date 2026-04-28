import assert from 'node:assert/strict';
import {
  resolveActiveAccountAfterAccountsRefresh,
  resolveActiveAccountAfterDelete,
} from '../src/renderer/utils/accountSelection';
import { resolveComposeSelectedAccount } from '../src/renderer/utils/composeAccount';
import { buildMailListViewModel } from '../src/renderer/utils/mailListViewModel';

const accountA = { id: 1, email: 'a@example.com', name: 'A' };
const accountB = { id: 2, email: 'b@example.com', name: 'B' };

assert.equal(resolveActiveAccountAfterDelete([accountA], 1, accountA), null);
assert.deepEqual(resolveActiveAccountAfterDelete([accountA, accountB], 1, accountA), accountB);
assert.equal(resolveActiveAccountAfterDelete([accountA, accountB], 1, 'all'), 'all');
assert.equal(resolveActiveAccountAfterAccountsRefresh([], 'all'), null);
assert.equal(resolveActiveAccountAfterAccountsRefresh([accountA], null), 'all');
assert.deepEqual(resolveActiveAccountAfterAccountsRefresh([accountA], accountA), accountA);
assert.equal(resolveComposeSelectedAccount([], null, null), null);

const viewModel = buildMailListViewModel({
  selectedFolder: 'inbox',
  currentAccount: null,
  accounts: [],
  nonDraftMailList: [
    {
      id: '1:1',
      uid: 1,
      from: 'sender@example.com',
      fromName: 'Sender',
      to: 'a@example.com',
      subject: 'Hello',
      snippet: 'Hello',
      date: new Date(),
      isRead: false,
      isStarred: false,
      folder: 'INBOX',
      accountId: 1,
      messageId: '<message@example.com>',
    } as any,
  ],
  nonDraftLocalThreadMails: [],
  mailRoutingResults: [],
  githubNotificationsViewEnabled: true,
  aiCategoryIds: [],
});

assert.equal(viewModel.folderEmails.length, 0);
assert.equal(viewModel.conversationAccountEmails.length, 0);

console.log('account empty state regression passed');
