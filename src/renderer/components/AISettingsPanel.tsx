import React, { useState, useEffect } from 'react';
import { useAI } from '../hooks/useAI';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsPanel({ isOpen, onClose }: Props) {
  const { config, fetchConfig, saveConfig } = useAI();
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen, fetchConfig]);

  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl);
      setModel(config.model);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const success = await saveConfig({ baseUrl, apiKey, model });
    setSaving(false);
    if (success) {
      setSaved(true);
      setApiKey('');
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>AI Settings</h2>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        <div style={contentStyle}>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#a0a6b5' }}>
            Configure your OpenAI-compatible API for AI features like translation, summarization, and reply suggestions.
          </p>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>API Base URL *</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              style={inputStyle}
              placeholder="https://api.openai.com/v1"
            />
            <p style={hintStyle}>
              Supports OpenAI, Anthropic, OpenRouter, Groq, and any OpenAI-compatible endpoint
            </p>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>API Key *</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={inputStyle}
              placeholder={config?.hasApiKey ? '(configured, enter to change)' : 'sk-...'}
            />
            {config?.hasApiKey && (
              <p style={{ ...hintStyle, color: '#6fcf6f' }}>API key is configured</p>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={inputStyle}
              placeholder="gpt-4o-mini"
            />
            <p style={hintStyle}>
              Examples: gpt-4o-mini, gpt-4o, claude-3-haiku, mixtral-8x7b
            </p>
          </div>

          {saved && (
            <div style={successStyle}>
              Settings saved successfully!
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !baseUrl}
            style={primaryButtonStyle}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  backgroundColor: '#1e2230',
  borderRadius: '12px',
  border: '1px solid #2d3144',
  width: '480px',
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #2d3144',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#7c8394',
  fontSize: '24px',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};

const contentStyle: React.CSSProperties = {
  padding: '20px',
  overflowY: 'auto',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '12px',
  padding: '16px 20px',
  borderTop: '1px solid #2d3144',
};

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: '16px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: '#a0a6b5',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '14px',
  backgroundColor: '#141720',
  border: '1px solid #2d3144',
  borderRadius: '6px',
  color: '#e4e7eb',
  outline: 'none',
  boxSizing: 'border-box',
};

const hintStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '12px',
  color: '#7c8394',
};

const successStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#1a2f1a',
  borderRadius: '6px',
  border: '1px solid #3a5a3a',
  color: '#6fcf6f',
  fontSize: '14px',
  textAlign: 'center',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: '#4a9eff',
  border: 'none',
  borderRadius: '6px',
  color: '#ffffff',
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '14px',
  backgroundColor: 'transparent',
  border: '1px solid #2d3144',
  borderRadius: '6px',
  color: '#a0a6b5',
  cursor: 'pointer',
};
