type AccountLike = {
  id: number;
  email: string;
  name: string;
  avatar?: string;
};

type SourceLike = {
  accountId: number;
} | null;

export function resolveComposeSelectedAccount(
  accounts: AccountLike[],
  currentAccount: AccountLike | 'all',
  source: SourceLike
): AccountLike | null {
  if (source) {
    return accounts.find((account) => account.id === source.accountId) ?? null;
  }

  if (currentAccount !== 'all') {
    return currentAccount;
  }

  return accounts[0] ?? null;
}
