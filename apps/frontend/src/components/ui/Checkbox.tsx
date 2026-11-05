import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode;
  description?: string;
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas has-disabled:cursor-not-allowed has-disabled:opacity-60',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-line accent-brand-500"
        {...props}
      />
      <span className="text-sm">
        <span className="text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}
