import {
  FAILURE_REASON_LABELS,
  FAILURE_REASONS,
  type FailureReason,
  type ListPrintJobsQuery,
} from '@alipe3d/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { printerLabel } from '@/modules/printers/printer-ui';
import { printerKeys, printersApi } from '@/modules/printers/printers.api';
import { todayIso } from '@/utils/format';
import { JobsHistory } from './JobsTable';

type StatusFilter = NonNullable<ListPrintJobsQuery['status']> | '';

/** Histórico de impressões de todas as impressoras, com filtro de falhas. */
export function PrintJobsPage() {
  const [printerId, setPrinterId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [failureReason, setFailureReason] = useState<FailureReason | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const printers = useQuery({ queryKey: printerKeys.list, queryFn: printersApi.list });

  const filter = {
    printerId,
    status: failureReason ? 'FAILED' : status,
    failureReason,
    from,
    to,
  } as const;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap">
        <Select
          aria-label="Filtrar por impressora"
          value={printerId}
          onChange={(e) => setPrinterId(e.target.value)}
          className="lg:w-52"
        >
          <option value="">Todas as impressoras</option>
          {printers.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {printerLabel(p)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por resultado"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="lg:w-44"
        >
          <option value="">Todos os resultados</option>
          <option value="active">Em andamento</option>
          <option value="SUCCEEDED">Concluídas</option>
          <option value="FAILED">Falhas</option>
        </Select>
        <Select
          aria-label="Filtrar por motivo da falha"
          value={failureReason}
          onChange={(e) => setFailureReason(e.target.value as FailureReason | '')}
          className="lg:w-60"
        >
          <option value="">Qualquer motivo de falha</option>
          {FAILURE_REASONS.map((r) => (
            <option key={r} value={r}>
              {FAILURE_REASON_LABELS[r]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="De"
            value={from}
            max={to || todayIso()}
            onChange={(e) => setFrom(e.target.value)}
            className="lg:w-40"
          />
          <span className="text-sm text-ink-muted">até</span>
          <Input
            type="date"
            aria-label="Até"
            value={to}
            min={from || undefined}
            max={todayIso()}
            onChange={(e) => setTo(e.target.value)}
            className="lg:w-40"
          />
        </div>
      </div>
      <JobsHistory
        key={JSON.stringify(filter)}
        filter={filter}
        emptyTitle="Nenhuma impressão encontrada"
        emptyDescription="As impressões são registradas ao iniciar a produção de uma ordem."
      />
    </Card>
  );
}
