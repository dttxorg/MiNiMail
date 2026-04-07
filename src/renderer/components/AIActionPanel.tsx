import React, { useState, useEffect } from 'react';
import { useAI } from '../hooks/useAI';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  emailContent: string;
}

type AIFunction = '翻译' | '总结' | '回复' | '润色';

export function AIActionPanel({ isOpen, onClose, emailContent }: Props) {
  const { loading, translate, summarize, suggestReply, polish } = useAI();
  const [language, setLanguage] = useState('中文');
  const [activeFunc, setActiveFunc] = useState<AIFunction | null>(null);
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [resultFunc, setResultFunc] = useState<AIFunction | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setInputText('');
      setActiveFunc(null);
      setResultFunc(null);
    }
  }, [isOpen]);

  const handleFuncClick = async (func: AIFunction) => {
    setActiveFunc(func);
    setResult(null);

    // For 翻译 and 总结, always use emailContent directly
    // For 润色 and 回复, use inputText if provided, otherwise use emailContent
    const content = (func === '翻译' || func === '总结') ? emailContent : (inputText || emailContent);
    if (!content) {
      setActiveFunc(null);
      return;
    }

    let res: string;
    switch (func) {
      case '翻译':
        res = await translate(content, language === '中文' ? 'Chinese' : 'English');
        break;
      case '总结':
        res = await summarize(content);
        break;
      case '回复':
        res = await suggestReply(content);
        break;
      case '润色':
        res = await polish(content, 'formal');
        break;
      default:
        res = '';
    }

    setResult(res);
    setResultFunc(func);
    setActiveFunc(null);
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={titleStyle}>AI 助手</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Language Selector */}
        <div style={langContainerStyle}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={langSelectStyle}
          >
            <option value="中文">中文</option>
            <option value="English">English</option>
          </select>
        </div>

        {/* Function Buttons */}
        <div style={funcButtonsStyle}>
          {(['翻译', '总结', '回复', '润色'] as AIFunction[]).map((func) => (
            <button
              key={func}
              onClick={() => handleFuncClick(func)}
              disabled={loading}
              style={{
                ...funcButtonStyle,
                ...(activeFunc === func ? funcButtonActiveStyle : {}),
              }}
            >
              {func}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div style={inputContainerStyle}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入内容..."
            style={textareaStyle}
          />
        </div>

        {/* Result Area */}
        {result && (
          <div style={resultContainerStyle}>
            <div style={resultHeaderStyle}>
              <span style={resultLabelStyle}>{resultFunc}</span>
              <button onClick={handleCopy} style={copyButtonStyle}>复制</button>
            </div>
            <div style={resultTextStyle}>{result}</div>
          </div>
        )}

        {/* Send Button */}
        <div style={sendContainerStyle}>
          <button
            onClick={() => handleFuncClick('翻译')}
            disabled={loading}
            style={sendButtonStyle}
          >
            {loading ? '处理中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '360px',
  backgroundColor: '#141b2d',
  borderLeft: '1px solid #1e293b',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 100,
};

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
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
  fontSize: '16px',
  fontWeight: 600,
  color: '#ffffff',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6b7280',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '0',
  lineHeight: 1,
};

const langContainerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderBottom: '1px solid #1e293b',
};

const langSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  backgroundColor: '#0f1623',
  border: '1px solid #2d3748',
  borderRadius: '6px',
  color: '#e4e7eb',
  cursor: 'pointer',
};

const funcButtonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '16px 20px',
  borderBottom: '1px solid #1e293b',
};

const funcButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 8px',
  fontSize: '13px',
  fontWeight: 500,
  backgroundColor: '#0f1623',
  border: '1px solid #2d3748',
  borderRadius: '6px',
  color: '#9ca3af',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const funcButtonActiveStyle: React.CSSProperties = {
  backgroundColor: 'rgba(74, 158, 255, 0.15)',
  borderColor: '#4A9EFF',
  color: '#4A9EFF',
};

const inputContainerStyle: React.CSSProperties = {
  padding: '16px 20px',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  padding: '12px',
  fontSize: '14px',
  backgroundColor: '#0f1623',
  border: '1px solid #2d3748',
  borderRadius: '8px',
  color: '#e4e7eb',
  resize: 'none',
  outline: 'none',
  fontFamily: 'inherit',
  lineHeight: 1.5,
};

const resultContainerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #1e293b',
  backgroundColor: '#0f1623',
  maxHeight: '200px',
  overflow: 'auto',
};

const resultHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

const resultLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: '#4A9EFF',
};

const copyButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  backgroundColor: 'transparent',
  border: '1px solid #2d3748',
  borderRadius: '4px',
  color: '#9ca3af',
  cursor: 'pointer',
};

const resultTextStyle: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: 1.6,
  color: '#e4e7eb',
  whiteSpace: 'pre-wrap',
};

const sendContainerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderTop: '1px solid #1e293b',
};

const sendButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: '#4A9EFF',
  border: 'none',
  borderRadius: '8px',
  color: '#ffffff',
  cursor: 'pointer',
};
