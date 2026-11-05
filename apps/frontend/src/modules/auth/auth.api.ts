import type {
  ApiSuccess,
  AuthSession,
  AuthUser,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
} from '@alipe3d/shared';
import { api, request } from '@/services/api';

type Message = { message: string };

export const authApi = {
  login: (input: LoginInput) => request(api.post<ApiSuccess<AuthSession>>('/auth/login', input)),
  logout: () => api.post('/auth/logout').catch(() => undefined),
  me: () => request(api.get<ApiSuccess<AuthUser>>('/auth/me')),
  changePassword: (input: ChangePasswordInput) =>
    request(api.post<ApiSuccess<AuthSession>>('/auth/change-password', input)),
  forgotPassword: (input: ForgotPasswordInput) =>
    request(api.post<ApiSuccess<Message>>('/auth/forgot-password', input)),
  resetPassword: (input: ResetPasswordInput) =>
    request(api.post<ApiSuccess<Message>>('/auth/reset-password', input)),
};
