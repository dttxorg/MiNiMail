import { useEffect, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { Maximize2, Minus, Square, X } from 'lucide-react';
import { buildIconButtonStyle, uiColor } from '../utils/uiDesignTokens';

interface WindowControlsProps {
  className?: string;
}

export function WindowControls({ className = '' }: WindowControlsProps) {
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const stopWindowDrag = (event: MouseEvent) => {
    event.stopPropagation();
  };

  useEffect(() => {
    let active = true;
    void window.electronAPI.isMaximized().then((value) => {
      if (active) setIsWindowMaximized(value);
    });
    const unsubscribe = window.electronAPI.onMaximizeChange(setIsWindowMaximized);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div
      className={`window-controls flex items-center gap-1.5 ${className}`}
      style={{ color: uiColor.textMuted, WebkitAppRegion: 'no-drag', pointerEvents: 'auto', zIndex: 10000 } as CSSProperties}
      onMouseDown={stopWindowDrag}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onMouseDown={stopWindowDrag}
        onMouseUp={stopWindowDrag}
        onClick={() => window.electronAPI.minimizeWindow()}
        className="w-8 h-8 flex items-center justify-center cursor-pointer"
        title="最小化"
        style={buildIconButtonStyle()}
      >
        <Minus className="w-3.5 h-3.5" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onMouseDown={stopWindowDrag}
        onMouseUp={stopWindowDrag}
        onClick={() => window.electronAPI.maximizeWindow()}
        className="w-8 h-8 flex items-center justify-center cursor-pointer"
        title={isWindowMaximized ? '还原' : '最大化'}
        style={buildIconButtonStyle()}
      >
        {isWindowMaximized ? (
          <Square className="w-3.5 h-3.5" strokeWidth={1.8} />
        ) : (
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.8} />
        )}
      </button>
      <button
        type="button"
        onMouseDown={stopWindowDrag}
        onMouseUp={stopWindowDrag}
        onClick={() => window.electronAPI.closeWindow()}
        className="w-8 h-8 flex items-center justify-center cursor-pointer hover:text-red-300"
        title="关闭"
        style={buildIconButtonStyle()}
      >
        <X className="w-3.5 h-3.5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
