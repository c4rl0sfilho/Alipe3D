import type { PermissionCode } from '@alipe3d/shared';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoaderCircle className="size-7 animate-spin text-brand-500" aria-label="Carregando" />
    </div>
  );
}

/** Rotas internas: exige sessão e troca de senha em dia. */
export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user?.mustChangePassword) return <Navigate to="/definir-senha" replace />;
  return <Outlet />;
}

/** Tela de troca de senha obrigatória: exige sessão, mas não exige senha em dia. */
export function RequireSession() {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Telas públicas (login, recuperação): quem já está logado vai para o início. */
export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Bloqueia a página quando falta permissão. A API também valida: isto é só experiência de uso. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionCode;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Acesso não permitido"
        description="Seu perfil não tem permissão para acessar esta página. Fale com o administrador se precisar deste acesso."
      />
    );
  }
  return <>{children}</>;
}
