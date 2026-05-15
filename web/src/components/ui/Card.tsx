import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  children: ReactNode;
  hoverable?: boolean;
}

export function Card({ title, description, children, hoverable, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-4',
        hoverable && 'transition-shadow hover:shadow-lg hover:border-primary/30 cursor-pointer',
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <div className="mb-3">
          {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
          {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
