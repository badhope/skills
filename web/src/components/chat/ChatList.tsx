import { cn } from '@/lib/cn';
import { MessageSquare } from 'lucide-react';

interface ChatItem {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp?: string;
  active?: boolean;
}

interface ChatListProps {
  chats?: ChatItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

const placeholderChats: ChatItem[] = [
  { id: '1', title: 'New Chat', lastMessage: 'Start a conversation...', timestamp: 'Now' },
  { id: '2', title: 'Refactor Auth Module', lastMessage: 'Completed refactoring...', timestamp: '2h ago' },
  { id: '3', title: 'Fix Memory Leak', lastMessage: 'Found the issue in...', timestamp: '1d ago' },
  { id: '4', title: 'Add Unit Tests', lastMessage: 'Writing tests for...', timestamp: '3d ago' },
];

export function ChatList({ chats, activeId, onSelect, className }: ChatListProps) {
  const items = chats || placeholderChats;

  return (
    <div className={cn('flex flex-col border-r border-border bg-bg-secondary w-64 shrink-0', className)}>
      <div className="p-3 border-b border-border">
        <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors">
          <MessageSquare size={14} />
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {items.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelect?.(chat.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 transition-colors border-l-2',
              activeId === chat.id
                ? 'bg-primary/10 border-primary text-text'
                : 'border-transparent text-text-secondary hover:bg-surface hover:text-text',
            )}
          >
            <div className="text-sm font-medium truncate">{chat.title}</div>
            {chat.lastMessage && (
              <div className="text-xs text-text-muted truncate mt-0.5">{chat.lastMessage}</div>
            )}
            {chat.timestamp && (
              <div className="text-xs text-text-muted mt-1">{chat.timestamp}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
