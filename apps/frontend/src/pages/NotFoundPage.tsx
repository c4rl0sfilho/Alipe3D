import { SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <SearchX className="size-10 text-brand-500" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-ink-muted">O endereço acessado não existe ou foi removido.</p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
