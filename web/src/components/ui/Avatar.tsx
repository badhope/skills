import { cn } from '@/lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: AvatarSize;
  fallback?: string;
  className?: string;
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ src, alt, size = 'md', fallback, className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt || 'Avatar'}
        className={cn('rounded-full object-cover', sizeStyles[size], className)}
      />
    );
  }

  const initials = fallback
    ? fallback.slice(0, 2).toUpperCase()
    : (alt || 'U').slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/20 text-primary font-medium',
        sizeStyles[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
