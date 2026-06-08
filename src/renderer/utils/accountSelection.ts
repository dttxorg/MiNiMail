export type AccountSelection = {
  id: number;
  email: string;
  name: string;
  avatar?: string;
};

export type ActiveAccountSelection = AccountSelection | 'all' | null;

export function resolveActiveAccountAfterDelete(
  accounts: AccountSelection[],
  deletedAccountId: number,
  currentAccount: ActiveAccountSelection,
): ActiveAccountSelection {
  const remaining = accounts.filter((account) => account.id !== deletedAccountId);
  if (remaining.length === 0) return null;

  if (currentAccount === null) return 'all';
  if (currentAccount === 'all') return 'all';
  if (currentAccount.id !== deletedAccountId) {
    return remaining.some((account) => account.id === currentAccount.id) ? currentAccount : 'all';
  }

  return remaining[0];
}

export function resolveActiveAccountAfterAccountsRefresh(
  accounts: AccountSelection[],
  currentAccount: ActiveAccountSelection,
): ActiveAccountSelection {
  if (accounts.length === 0) return null;
  if (currentAccount === null) return 'all';
  if (currentAccount === 'all') return 'all';
  return accounts.some((account) => account.id === currentAccount.id) ? currentAccount : 'all';
}
