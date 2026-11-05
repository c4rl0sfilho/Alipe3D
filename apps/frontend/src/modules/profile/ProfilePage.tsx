import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { ChangePasswordFormFields } from '../auth/ChangePasswordForm';

export function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Meu perfil" description="Seus dados de acesso." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="h-fit p-5">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">Nome</dt>
              <dd className="mt-1">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">E-mail</dt>
              <dd className="mt-1">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                Perfil de acesso
              </dt>
              <dd className="mt-1">{user.role.name}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-line pt-4 text-xs text-ink-muted">
            Para alterar nome, e-mail ou perfil, fale com um administrador.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Alterar senha</h2>
          <p className="mt-1 mb-5 text-sm text-ink-muted">
            Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas.
          </p>
          <ChangePasswordFormFields
            submitLabel="Alterar senha"
            onSuccess={() => toast.success('Senha alterada com sucesso.')}
          />
        </Card>
      </div>
    </>
  );
}
