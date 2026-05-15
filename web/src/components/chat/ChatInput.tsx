import { useState } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ChatInputProps {
  onSend?: (message: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ChatInput({ onSend, placeholder = 'Type a message...', className, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn('border-t border-border bg-bg-secondary/50 p-4', className)}>
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2">
        <button className="shrink-0 p-2 rounded-lg text-text-muted hover:text-text hover:bg-bg-tertiary transition-colors">
          <Paperclip size={16} />
        </button>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none min-h-[36px] max-h-[120px]"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className={cn(
            'shrink-0 p-2 rounded-lg transition-colors',
            value.trim()
              ? 'bg-primary text-white hover:bg-primary-hover'
              : 'text-text-muted cursor-not-allowed',
          )}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
