import { useState, useCallback } from 'react';

export interface AIConfig {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  activeProfileId?: 'primary' | 'secondary';
  profiles?: Record<'primary' | 'secondary', {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  }>;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface AISegmentsResponse {
  success: boolean;
  translations?: string[];
  error?: string;
}

export interface AIEmailSourcePayload {
  subject?: string;
  from?: string;
  from_name?: string;
  to?: string;
  cc?: string;
  date?: string | Date;
  body_html?: string;
  body_text?: string;
  snippet?: string;
  category?: string;
  scan_result?: string;
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

  const saveConfig = useCallback(async (newConfig: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    profileId?: 'primary' | 'secondary';
    activeProfileId?: 'primary' | 'secondary';
  }): Promise<boolean> => {
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

  const translate = useCallback(async (text: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
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

  const translateSegments = useCallback(async (segments: string[], targetLang: string): Promise<string[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:translateSegments', segments, targetLang) as AISegmentsResponse;
      if (response.success && response.translations) {
        return response.translations;
      }
      throw new Error(response.error || 'Segment translation failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const summarize = useCallback(async (text: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:summarize', text, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Summarization failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestReply = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestReply', emailContent, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Reply suggestion failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestActions = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestActions', emailContent, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Action suggestion failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestQuickReplies = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestQuickReplies', emailContent, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Quick replies failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const extractKeyInfo = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:extractKeyInfo', emailContent, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Key info extraction failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const polish = useCallback(async (
    text: string,
    style: 'formal' | 'friendly' | 'shorter' | 'longer',
    targetLang?: string,
  ): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:polish', text, style, targetLang) as AIResponse;
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
    translateSegments,
    summarize,
    suggestReply,
    suggestActions,
    suggestQuickReplies,
    extractKeyInfo,
    polish,
  };
}
