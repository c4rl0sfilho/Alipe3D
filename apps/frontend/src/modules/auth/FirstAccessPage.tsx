import { Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLayout } from './AuthLayout';
import { ChangePasswordFormFields } from './ChangePasswordForm';

/** Troca de senha obrigatória (senha provisória definida pelo administrador). */
export function FirstAccessPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (user && !user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Defina sua senha"
      description={`Olá, ${user?.name ?? ''}. Antes de continuar, troque a senha provisória por uma senha pessoal.`}
    >
      <div className="space-y-5">
        <Alert tone="info">A senha atual é a senha provisória que você recebeu.</Alert>
        <ChangePasswordFormFields
          submitLabel="Salvar e continuar"
          onSuccess={() => navigate('/', { replace: true })}
        />
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sm font-medium text-ink-muted hover:text-ink"
        >
          Sair
        </button>
      </div>
    </AuthLayout>
  );
}
