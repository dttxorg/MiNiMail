import { useState, useCallback } from 'react';

export interface AIConfig {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export function useAI() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await window.electronAPI.invoke('ai:getConfig') as { success: boolean; data?: AIConfig };
      if (response.success && response.data) {
        setConfig(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch AI config:', err);
    }
  }, []);

  const saveConfig = useCallback(async (newConfig: { baseUrl?: string; apiKey?: string; model?: string }): Promise<boolean> => {
    try {
      const response = await window.electronAPI.invoke('ai:saveConfig', newConfig) as { success: boolean; error?: string };
      if (response.success) {
        await fetchConfig();
        return true;
      }
      setError(response.error || 'Failed to save config');
      return false;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [fetchConfig]);

  const translate = useCallback(async (text: string, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:translate', text, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Translation failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const summarize = useCallback(async (text: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:summarize', text) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Summarization failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestReply = useCallback(async (emailContent: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestReply', emailContent) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Reply suggestion failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const polish = useCallback(async (text: string, style: 'formal' | 'friendly' | 'shorter' | 'longer'): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:polish', text, style) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Text polishing failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    config,
    loading,
    error,
    fetchConfig,
    saveConfig,
    translate,
    summarize,
    suggestReply,
    polish,
  };
}
