import React from 'react';
import { buildModalShellStyle } from '../utils/uiDesignTokens';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  height?: string;
}

export function Modal({ isOpen, onClose, children, width = 'max-w-lg', height }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center isolation-isolate">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className={`relative z-10 overflow-hidden flex flex-col ${width} ${height ?? 'max-h-[90vh]'}`}
        style={buildModalShellStyle()}
      >
        {children}
      </div>
    </div>
  );
}
