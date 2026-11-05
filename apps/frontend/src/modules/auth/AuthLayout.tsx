import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Moldura das telas públicas: logo em destaque à esquerda (desktop) e formulário à direita. */
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-brand-50 p-10 lg:flex">
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-brand-100"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-brand-100/60"
          aria-hidden="true"
        />
        <p className="relative text-sm font-medium text-brand-700">Alipe3D Manager</p>
        <div className="relative">
          <img
            src="/logo-alipe3d.png"
            alt="Alipe3D — Sua loja digital"
            width={220}
            height={220}
            className="size-56 rounded-full shadow-lg shadow-brand-300/30"
          />
          <h2 className="mt-8 max-w-sm text-2xl font-semibold tracking-tight text-ink">
            Produção, estoque e vendas em um só lugar.
          </h2>
          <p className="mt-2 max-w-sm text-sm text-ink-muted">
            Tecnologia, controle e eficiência para a produção 3D.
          </p>
        </div>
        <p className="relative text-xs text-ink-muted">© {new Date().getFullYear()} Alipe3D</p>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-surface px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <img
            src="/logo-alipe3d.png"
            alt="Alipe3D"
            width={88}
            height={88}
            className="mx-auto mb-6 size-22 rounded-full lg:hidden"
          />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
