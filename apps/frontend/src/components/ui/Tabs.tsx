import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/utils/cn';

const tabClasses = (active: boolean) =>
  cn(
    '-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors',
    active ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink',
  );

interface LinkTab {
  to: string;
  label: string;
  end?: boolean;
  badge?: ReactNode;
}

/** Abas de navegação (cada aba é uma rota). */
export function LinkTabs({ tabs }: { tabs: LinkTab[] }) {
  return (
    <nav
      className="mb-6 overflow-x-auto overflow-y-hidden border-b border-line"
      aria-label="Seções"
    >
      <div className="flex gap-6">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => tabClasses(isActive)}
          >
            {tab.label}
            {tab.badge}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

interface StateTab<T extends string> {
  id: T;
  label: string;
  badge?: ReactNode;
}

/** Abas dentro da mesma página. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: StateTab<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="mb-6 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={tabClasses(value === tab.id)}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

export function CountBadge({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted tabular-nums">
      {value}
    </span>
  );
}
