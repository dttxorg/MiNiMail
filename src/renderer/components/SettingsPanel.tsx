import React, { useState, useEffect } from 'react';
import { useAI } from '../hooks/useAI';
import { useAccounts } from '../hooks/useAccounts';
import type { CreateAccountInput, Account } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'ai' | 'accounts' | 'oauth';

export function SettingsPanel({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('ai');
  const { config, fetchConfig, saveConfig, loading } = useAI();
  const { accounts, deleteAccount, createAccount } = useAccounts();

  // AI Settings state
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // OAuth state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [oauthStatus, setOauthStatus] = useState<{ configured: boolean; authenticated: boolean }>({ configured: false, authenticated: false });
  const [oauthLoading, setOauthLoading] = useState(false);

  // Add Account state
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accountForm, setAccountForm] = useState<CreateAccountInput>({
    email: '',
    display_name: '',
    provider: 'custom',
    auth_type: 'password',
    imap_host: '',
    imap_port: 993,
    smtp_host: '',
    smtp_port: 587,
    username: '',
    password: '',
    use_tls: true,
  });

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setActiveTab('ai');
      checkOAuthStatus();
    }
  }, [isOpen, fetchConfig]);

  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl);
      setModel(config.model);
    }
  }, [config]);

  const checkOAuthStatus = async () => {
    try {
      const status = await window.electronAPI.invoke('oauth:getStatus') as { configured: boolean; authenticated: boolean };
      setOauthStatus(status);
    } catch (err) {
      console.error('Failed to get OAuth status:', err);
    }
  };

  const handleSaveAI = async () => {
    setSaving(true);
    const success = await saveConfig({ baseUrl, apiKey, model });
    setSaving(false);
    if (success) {
      setSaved(true);
      setApiKey('');
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleSaveOAuth = async () => {
    setSaving(true);
    try {
      await window.electronAPI.invoke('settings:set', 'google_client_id', clientId);
      await window.electronAPI.invoke('settings:set', 'google_client_secret', clientSecret);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await checkOAuthStatus();
    } catch (err) {
      console.error('Failed to save OAuth settings:', err);
    }
    setSaving(false);
  };

  const handleStartOAuth = async () => {
    setOauthLoading(true);
    try {
      const result = await window.electronAPI.invoke('oauth:startFlow') as { success: boolean; message: string };
      if (result.success) {
        alert('请在浏览器中完成授权，然后返回应用。');
      } else {
        alert('授权失败: ' + result.message);
      }
    } catch (err) {
      console.error('OAuth error:', err);
    }
    setOauthLoading(false);
  };

  const handleAddAccount = async () => {
    if (!accountForm.email) return;
    await createAccount(accountForm);
    setShowAddAccount(false);
    setAccountForm({
      email: '',
      display_name: '',
      provider: 'custom',
      auth_type: 'password',
      imap_host: '',
      imap_port: 993,
      smtp_host: '',
      smtp_port: 587,
      username: '',
      password: '',
      use_tls: true,
    });
  };

  const handleDeleteAccount = async (id: number) => {
    if (confirm('确定要删除这个账号吗？')) {
      await deleteAccount(id);
    }
  };

  const getProviderLabel = (account: Account) => {
    if (account.provider === 'gmail' && account.auth_type === 'oauth') return 'Gmail / OAuth';
    if (account.provider === 'gmail') return 'Gmail';
    if (account.provider === 'outlook') return 'Outlook';
    if (account.provider === 'yahoo') return 'Yahoo';
    return account.provider;
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>设置</h2>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Tabs */}
        <div style={tabsStyle}>
          <button
            style={{ ...tabStyle, ...(activeTab === 'ai' ? tabActiveStyle : {}) }}
            onClick={() => setActiveTab('ai')}
          >
            AI
          </button>
          <button
            style={{ ...tabStyle, ...(activeTab === 'accounts' ? tabActiveStyle : {}) }}
            onClick={() => setActiveTab('accounts')}
          >
            账号
          </button>
          <button
            style={{ ...tabStyle, ...(activeTab === 'oauth' ? tabActiveStyle : {}) }}
            onClick={() => setActiveTab('oauth')}
          >
            Gmail OAuth
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {activeTab === 'ai' && (
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>AI 设置</h3>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>模型</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={inputStyle}
                  placeholder="输入自定义模型，如 gpt-4o-mini, claude-3-haiku 等"
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={inputStyle}
                  placeholder={config?.hasApiKey ? '已配置（输入新值以更改）' : '输入 API Key'}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>API 地址</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  style={inputStyle}
                  placeholder="https://openrouter.ai/api/v1"
                />
                <p style={hintStyle}>支持 OpenAI、OpenRouter、Groq 等兼容接口</p>
              </div>

              <button
                onClick={handleSaveAI}
                disabled={saving}
                style={saveButtonStyle}
              >
                {saving ? '保存中...' : '保存'}
              </button>

              {saved && <p style={successTextStyle}>设置已保存</p>}
            </div>
          )}

          {activeTab === 'accounts' && (
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>已连接的账号</h3>

              {accounts.length === 0 ? (
                <p style={emptyTextStyle}>暂无已连接的账号</p>
              ) : (
                <div style={accountListStyle}>
                  {accounts.map((account) => (
                    <div key={account.id} style={accountItemStyle}>
                      <div style={accountAvatarStyle}>
                        {(account.email || '?')[0].toUpperCase()}
                      </div>
                      <div style={accountInfoStyle}>
                        <div style={accountEmailStyle}>{account.email}</div>
                        <div style={accountProviderStyle}>{getProviderLabel(account)}</div>
                      </div>
                      <button
                        onClick={() => handleDeleteAccount(account.id)}
                        style={deleteButtonStyle}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowAddAccount(!showAddAccount)}
                style={addButtonStyle}
              >
                + 添加账号
              </button>

              {showAddAccount && (
                <div style={addAccountFormStyle}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#e4e7eb' }}>添加新账号</h4>

                  <div style={fieldGroupStyle}>
                    <label style={labelStyle}>邮箱地址</label>
                    <input
                      type="email"
                      value={accountForm.email}
                      onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                      style={inputStyle}
                      placeholder="your@email.com"
                    />
                  </div>

                  <div style={fieldGroupStyle}>
                    <label style={labelStyle}>类型</label>
                    <select
                      value={accountForm.provider}
                      onChange={(e) => setAccountForm({
                        ...accountForm,
                        provider: e.target.value as 'gmail' | 'outlook' | 'yahoo' | 'custom',
                        imap_host: e.target.value === 'gmail' ? 'imap.gmail.com' :
                                   e.target.value === 'outlook' ? 'outlook.office365.com' :
                                   e.target.value === 'yahoo' ? 'imap.mail.yahoo.com' : '',
                        smtp_host: e.target.value === 'gmail' ? 'smtp.gmail.com' :
                                  e.target.value === 'outlook' ? 'smtp.office365.com' :
                                  e.target.value === 'yahoo' ? 'smtp.mail.yahoo.com' : '',
                      })}
                      style={inputStyle}
                    >
                      <option value="gmail">Gmail</option>
                      <option value="outlook">Outlook</option>
                      <option value="yahoo">Yahoo</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>

                  <div style={fieldGroupStyle}>
                    <label style={labelStyle}>密码</label>
                    <input
                      type="password"
                      value={accountForm.password}
                      onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                      style={inputStyle}
                      placeholder="输入密码"
                    />
                  </div>

                  <button onClick={handleAddAccount} style={saveButtonStyle}>
                    添加
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'oauth' && (
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Gmail OAuth 设置</h3>

              <div style={oauthStatusStyle}>
                <span style={oauthStatusDotStyle(oauthStatus.configured && oauthStatus.authenticated)} />
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                  {oauthStatus.configured && oauthStatus.authenticated
                    ? '已连接 Google 账号'
                    : oauthStatus.configured
                    ? '已配置，请登录 Google'
                    : '未配置'}
                </span>
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Google Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  style={inputStyle}
                  placeholder="输入 Google Client ID"
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Google Client Secret</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  style={inputStyle}
                  placeholder="输入 Google Client Secret"
                />
              </div>

              <button onClick={handleSaveOAuth} disabled={saving} style={saveButtonStyle}>
                {saving ? '保存中...' : '保存配置'}
              </button>

              {saved && <p style={successTextStyle}>设置已保存</p>}

              <div style={oauthHelpStyle}>
                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#9ca3af' }}>
                  如何获取 Google OAuth 凭据：
                </p>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#6b7280', lineHeight: 1.8 }}>
                  <li>访问 <a href="#" onClick={(e) => { e.preventDefault(); require('electron').shell.openExternal('https://console.cloud.google.com/'); }} style={{ color: '#4A9EFF' }}>Google Cloud Console</a></li>
                  <li>创建新项目或选择现有项目</li>
                  <li>启用 Gmail API</li>
                  <li>创建 OAuth 2.0 客户端 ID（Web application）</li>
                  <li>设置重定向 URI 为: <code style={{ fontSize: '11px', color: '#4A9EFF' }}>http://localhost:19737/oauth/callback</code></li>
                  <li>复制 Client ID 和 Client Secret 到上方输入框</li>
                </ol>
              </div>

              {oauthStatus.configured && !oauthStatus.authenticated && (
                <button onClick={handleStartOAuth} disabled={oauthLoading} style={oauthButtonStyle}>
                  {oauthLoading ? '打开浏览器授权...' : '使用浏览器登录 Google'}
                </button>
              )}
            </div>
          )}
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

const panelStyle: React.CSSProperties = {
  width: '480px',
  maxHeight: '80vh',
  backgroundColor: '#141b2d',
  borderRadius: '12px',
  border: '1px solid #1e293b',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #1e293b',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '18px',
  fontWeight: 600,
  color: '#ffffff',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6b7280',
  fontSize: '24px',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #1e293b',
};

const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  fontSize: '14px',
  fontWeight: 500,
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: '#6b7280',
  cursor: 'pointer',
};

const tabActiveStyle: React.CSSProperties = {
  color: '#4A9EFF',
  borderBottomColor: '#4A9EFF',
};

const contentStyle: React.CSSProperties = {
  padding: '20px',
  overflowY: 'auto',
  flex: 1,
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  fontWeight: 600,
  color: '#9ca3af',
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '14px',
  backgroundColor: '#0f1623',
  border: '1px solid #2d3748',
  borderRadius: '6px',
  color: '#e4e7eb',
  outline: 'none',
};

const hintStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '12px',
  color: '#6b7280',
};

const saveButtonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: '#4A9EFF',
  border: 'none',
  borderRadius: '6px',
  color: '#ffffff',
  cursor: 'pointer',
};

const successTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: '#10B981',
};

const emptyTextStyle: React.CSSProperties = {
  margin: '20px 0',
  fontSize: '14px',
  color: '#6b7280',
  textAlign: 'center',
};

const accountListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const accountItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  backgroundColor: '#0f1623',
  borderRadius: '8px',
};

const accountAvatarStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  backgroundColor: '#4A9EFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  fontWeight: 600,
  color: '#ffffff',
  flexShrink: 0,
};

const accountInfoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const accountEmailStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#e4e7eb',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const accountProviderStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '13px',
  backgroundColor: 'transparent',
  border: '1px solid #EF4444',
  borderRadius: '4px',
  color: '#EF4444',
  cursor: 'pointer',
};

const addButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: 'transparent',
  border: '1px solid #2d3748',
  borderRadius: '6px',
  color: '#9ca3af',
  cursor: 'pointer',
  marginTop: '8px',
};

const addAccountFormStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  backgroundColor: '#0f1623',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const oauthStatusStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  backgroundColor: '#0f1623',
  borderRadius: '6px',
  marginBottom: '16px',
};

const oauthStatusDotStyle = (connected: boolean): React.CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: connected ? '#10B981' : '#EF4444',
});

const oauthHelpStyle: React.CSSProperties = {
  marginTop: '20px',
  padding: '16px',
  backgroundColor: '#0f1623',
  borderRadius: '8px',
  border: '1px solid #2d3748',
};

const oauthButtonStyle: React.CSSProperties = {
  marginTop: '16px',
  width: '100%',
  padding: '12px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: '#4285F4',
  border: 'none',
  borderRadius: '6px',
  color: '#ffffff',
  cursor: 'pointer',
};
