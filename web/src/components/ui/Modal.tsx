import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-lg font-semibold text-text">{title}</h2>}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-tertiary hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
