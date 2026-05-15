import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeKey, defaultActiveKey, onChange, className }: TabsProps) {
  const [internalKey, setInternalKey] = useState(defaultActiveKey || tabs[0]?.key || '');
  const currentKey = activeKey ?? internalKey;

  const handleChange = (key: string) => {
    setInternalKey(key);
    onChange?.(key);
  };

  return (
    <div className={cn('flex border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => handleChange(tab.key)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            currentKey === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary',
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
