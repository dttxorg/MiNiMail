import { resolveComposeSelectedAccount } from '../src/renderer/utils/composeAccount';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const accounts = [
  { id: 1, email: 'a@example.com', name: 'A' },
  { id: 2, email: 'b@example.com', name: 'B' },
];

function testReplyUsesSourceAccount() {
  const resolved = resolveComposeSelectedAccount(accounts, 'all', { accountId: 2 });
  assert(resolved?.id === 2, 'Expected reply/forward compose to default to source mail account');
}

function testNewMailFallsBackToCurrentAccount() {
  const resolved = resolveComposeSelectedAccount(accounts, accounts[0], null);
  assert(resolved?.id === 1, 'Expected new compose to default to current account');
}

function testGlobalNewMailFallsBackToFirstAccount() {
  const resolved = resolveComposeSelectedAccount(accounts, 'all', null);
  assert(resolved?.id === 1, 'Expected global new compose to fall back to first available account');
}

function run() {
  testReplyUsesSourceAccount();
  testNewMailFallsBackToCurrentAccount();
  testGlobalNewMailFallsBackToFirstAccount();
  console.log('compose-account tests passed');
}

run();
