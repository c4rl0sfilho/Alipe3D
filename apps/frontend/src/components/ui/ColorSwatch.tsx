import { cn } from '@/utils/cn';

/** Bolinha com a cor do filamento (ou tracejada quando não informada). */
export function ColorSwatch({ hex, className }: { hex: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-3.5 shrink-0 rounded-full border',
        hex ? 'border-ink/15' : 'border-dashed border-ink-muted/50',
        className,
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}
