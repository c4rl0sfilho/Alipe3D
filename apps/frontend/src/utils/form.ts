import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toApiRequestError } from '@/services/api';

/**
 * Aplica no formulário os erros por campo devolvidos pela API e retorna a mensagem geral.
 * Os campos que não existem no formulário são ignorados.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string {
  const apiError = toApiRequestError(error);
  for (const [field, message] of Object.entries(apiError.fieldErrors)) {
    if ((fields as readonly string[]).includes(field)) {
      setError(field as Path<T>, { type: 'server', message });
    }
  }
  return apiError.message;
}
