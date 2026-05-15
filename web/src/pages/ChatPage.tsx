import { ChatList } from '@/components/chat/ChatList';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useState } from 'react';

const placeholderMessages = [
  { id: '1', role: 'assistant' as const, content: 'Hello! I am DevFlow Agent. How can I help you today?', timestamp: '10:00' },
  { id: '2', role: 'user' as const, content: 'Help me refactor the authentication module.', timestamp: '10:01' },
  { id: '3', role: 'assistant' as const, content: 'I\'ll analyze your authentication module and suggest improvements. Let me start by examining the current code structure...', timestamp: '10:01' },
];

export default function ChatPage() {
  const [activeChat, setActiveChat] = useState('1');

  return (
    <div className="flex h-full">
      {/* Chat list sidebar */}
      <ChatList activeId={activeChat} onSelect={setActiveChat} />

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-4">
            {placeholderMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
              />
            ))}
          </div>
        </div>

        {/* Input */}
        <ChatInput onSend={(msg) => console.log('Send:', msg)} />
      </div>
    </div>
  );
}
