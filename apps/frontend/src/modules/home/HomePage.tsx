import { ArrowRight, Construction } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { NAVIGATION } from '@/layouts/navigation';
import { SystemHealthCards } from '../system/SystemHealthCards';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Página inicial. O dashboard com indicadores reais chega na Fase 6;
 * até lá, nenhum número é exibido para não apresentar dados que ainda não existem.
 */
export function HomePage() {
  const { user, can } = useAuth();
  const firstName = user?.name.split(' ')[0] ?? '';

  const available = NAVIGATION.flatMap((section) => section.items).filter(
    (item) => item.to !== '/' && !item.plannedPhase && (!item.permission || can(item.permission)),
  );
  const planned = NAVIGATION.flatMap((section) => section.items).filter(
    (item) => item.plannedPhase && (!item.permission || can(item.permission)),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Bem-vindo ao Alipe3D Manager.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Situação do sistema</h2>
        <SystemHealthCards />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Acesso rápido</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {available.map((item) => (
            <Link key={item.to} to={item.to} className="group">
              <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-brand-300">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <item.icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                <ArrowRight
                  className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {planned.length > 0 && (
        <section>
          <Card className="flex items-start gap-4 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <Construction className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">Próximos módulos</p>
              <p className="mt-1 text-sm text-ink-muted">
                Indicadores e gráficos aparecem aqui quando os módulos operacionais estiverem
                prontos. Em desenvolvimento:
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {planned.map((item) => (
                  <li
                    key={item.to}
                    className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted"
                  >
                    {item.label} · Fase {item.plannedPhase}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
