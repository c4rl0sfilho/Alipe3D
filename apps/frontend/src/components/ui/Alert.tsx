import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Tone = 'error' | 'success' | 'info';

const styles: Record<Tone, string> = {
  error: 'border-danger/25 bg-danger-soft text-danger',
  success: 'border-success/25 bg-success-soft text-success',
  info: 'border-line bg-canvas text-ink-muted',
};

const icons = { error: CircleAlert, success: CircleCheck, info: Info };

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm', styles[tone])}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
