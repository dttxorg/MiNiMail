import { useState, useEffect, useCallback } from 'react';
import type { Account, CreateAccountInput, ApiResponse, ImapConnectionResult } from '../types';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('accounts:getAll');
      const result = response as ApiResponse<Account[]>;
      if (result.success && result.data) {
        setAccounts(result.data);
      } else {
        setError(result.error || 'Failed to fetch accounts');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = useCallback(async (input: CreateAccountInput): Promise<ApiResponse<Account>> => {
    try {
      const response = await window.electronAPI.invoke('accounts:create', input);
      const result = response as ApiResponse<Account>;
      if (result.success) {
        await fetchAccounts();
      }
      return result;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: number, input: Partial<CreateAccountInput>): Promise<ApiResponse<Account>> => {
    try {
      const response = await window.electronAPI.invoke('accounts:update', id, input);
      const result = response as ApiResponse<Account>;
      if (result.success) {
        await fetchAccounts();
      }
      return result;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: number): Promise<ApiResponse<void>> => {
    try {
      const response = await window.electronAPI.invoke('accounts:delete', id);
      const result = response as ApiResponse<void>;
      if (result.success) {
        await fetchAccounts();
      }
      return result;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }, [fetchAccounts]);

  const setDefaultAccount = useCallback(async (id: number): Promise<ApiResponse<void>> => {
    try {
      const response = await window.electronAPI.invoke('accounts:setDefault', id);
      const result = response as ApiResponse<void>;
      if (result.success) {
        await fetchAccounts();
      }
      return result;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }, [fetchAccounts]);

  const testImapConnection = useCallback(async (id: number): Promise<ImapConnectionResult> => {
    try {
      const response = await window.electronAPI.invoke('accounts:testImap', id);
      return response as ImapConnectionResult;
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }, []);

  const testSmtpConnection = useCallback(async (id: number): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await window.electronAPI.invoke('accounts:testSmtp', id);
      return response as { success: boolean; message: string };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }, []);

  return {
    accounts,
    loading,
    error,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    testImapConnection,
    testSmtpConnection,
  };
}

// Extend window.electronAPI with invoke method
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getUserDataPath: () => Promise<string>;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}
