import type { AuthSession, AuthUser, LoginInput, PermissionCode } from '@alipe3d/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '@/modules/auth/auth.api';
import { refreshSession, registerSessionHandlers, setAccessToken } from '@/services/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Aplica uma sessão nova (ex.: após trocar a senha). */
  applySession: (session: AuthSession) => void;
  can: (...permissions: PermissionCode[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const applySession = useCallback((session: AuthSession) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restaura a sessão ao abrir/recarregar a página, a partir do cookie httpOnly.
  useEffect(() => {
    registerSessionHandlers({ renewed: applySession, expired: clearSession });
    refreshSession()
      .then(applySession)
      .catch(() => {
        setAccessToken(null);
        setStatus('anonymous');
      });
  }, [applySession, clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      const session = await authApi.login(input);
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    clearSession();
  }, [clearSession]);

  const can = useCallback(
    (...permissions: PermissionCode[]) =>
      !!user && permissions.every((permission) => user.permissions.includes(permission)),
    [user],
  );

  const value = useMemo(
    () => ({ status, user, login, logout, applySession, can }),
    [status, user, login, logout, applySession, can],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook acoplado ao provider
export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
