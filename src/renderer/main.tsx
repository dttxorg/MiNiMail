import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary] uncaught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="w-screen h-screen flex flex-col items-center justify-center p-8 select-none"
          style={{
            backgroundColor: '#0A0B0E',
            color: '#FFFFFF',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-red-500/20 bg-[#14161B] p-6 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto text-xl">
              ⚠️
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-white">界面加载遇到异常</h2>
              <p className="text-[11px] text-[#8E8E93] mt-1 leading-relaxed">
                MiNiMail 在渲染时捕获到一个未处理错误，已安全隔离，未损坏本地邮件数据。
              </p>
            </div>
            {this.state.error && (
              <pre className="p-3 rounded-lg bg-[#0E1014] text-[10px] text-red-400 font-mono text-left max-h-32 overflow-y-auto whitespace-pre-wrap break-all border border-white/5">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-[#6366F1] text-white text-xs font-medium hover:bg-[#4F46E5] transition-colors cursor-pointer"
              >
                重新加载页面
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-xs font-medium hover:bg-white/10 transition-colors cursor-pointer"
              >
                尝试恢复
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
