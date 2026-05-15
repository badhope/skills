import { cn } from '@/lib/cn';
import { Avatar } from '../ui/Avatar';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  className?: string;
}

export function MessageBubble({ role, content, timestamp, className }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3 px-4 py-3', isUser ? 'flex-row-reverse' : '', className)}>
      <Avatar
        alt={isUser ? 'You' : 'Agent'}
        size="sm"
        fallback={isUser ? 'U' : 'AI'}
        className="shrink-0 mt-0.5"
      />
      <div className={cn('flex flex-col gap-1 max-w-[75%]', isUser && 'items-end')}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">
            {isUser ? 'You' : 'DevFlow Agent'}
          </span>
          {timestamp && <span className="text-xs text-text-muted">{timestamp}</span>}
        </div>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-white rounded-tr-md'
              : 'bg-surface border border-border text-text rounded-tl-md',
          )}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
