import { cn } from '@/utils/cn';

interface BrandMarkProps {
  className?: string;
  /** Classes do texto ao lado da logo (ex.: ocultar com a sidebar recolhida). */
  textClassName?: string | undefined;
}

export function BrandMark({ className, textClassName }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/logo-alipe3d.png"
        alt="Alipe3D"
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-full"
      />
      <span className={cn('leading-tight', textClassName)}>
        <span className="block text-[15px] font-semibold tracking-tight text-ink">Alipe3D</span>
        <span className="block text-xs text-ink-muted">Manager</span>
      </span>
    </div>
  );
}
