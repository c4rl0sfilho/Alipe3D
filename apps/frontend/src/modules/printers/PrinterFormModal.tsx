import {
  PRINTER_STATUS_LABELS,
  PRINTER_STATUSES,
  printerInputSchema,
  type PrinterInput,
  type PrinterStatus,
  type PrinterSummary,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { toApiRequestError } from '@/services/api';
import { applyServerErrors } from '@/utils/form';
import { formatNumber, todayIso } from '@/utils/format';
import { printersApi } from './printers.api';

const FIELDS = ['code', 'name', 'model', 'serialNumber', 'acquiredAt', 'initialHours'] as const;

export function PrinterFormModal({
  open,
  printer,
  onClose,
}: {
  open: boolean;
  printer: PrinterSummary | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={printer ? `Editar ${printer.code}` : 'Cadastrar impressora'}
    >
      <PrinterForm key={printer?.id ?? 'new'} printer={printer} onDone={onClose} />
    </Modal>
  );
}

function PrinterForm({ printer, onDone }: { printer: PrinterSummary | null; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PrinterInput>({
    resolver: zodResolver(printerInputSchema),
    defaultValues: {
      code: printer?.code ?? '',
      name: printer?.name ?? '',
      model: printer?.model ?? 'Bambu Lab A1',
      serialNumber: printer?.serialNumber ?? '',
      acquiredAt: printer?.acquiredAt ?? '',
      initialHours: printer ? printer.initialHours.replace('.', ',') : '0',
      notes: printer?.notes ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: PrinterInput) =>
      printer ? printersApi.update(printer.id, values) : printersApi.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printers'] });
      toast.success(printer ? 'Impressora atualizada.' : 'Impressora cadastrada.');
      onDone();
    },
    onError: (error) => setFormError(applyServerErrors(error, setError, FIELDS)),
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        mutation.mutate(values);
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identificação"
          htmlFor="pr-code"
          error={errors.code?.message}
          required
          hint="Ex.: ALIPE-PRINTER-03"
        >
          <Input
            id="pr-code"
            autoFocus
            className="uppercase"
            invalid={!!errors.code}
            {...register('code')}
          />
        </Field>
        <Field label="Apelido" htmlFor="pr-name" error={errors.name?.message}>
          <Input id="pr-name" placeholder="Opcional" {...register('name')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Modelo" htmlFor="pr-model" error={errors.model?.message} required>
          <Input id="pr-model" invalid={!!errors.model} {...register('model')} />
        </Field>
        <Field label="Número de série" htmlFor="pr-serial" error={errors.serialNumber?.message}>
          <Input id="pr-serial" placeholder="Opcional" {...register('serialNumber')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data de aquisição" htmlFor="pr-acquired" error={errors.acquiredAt?.message}>
          <Input id="pr-acquired" type="date" max={todayIso()} {...register('acquiredAt')} />
        </Field>
        <Field
          label="Horas já impressas"
          htmlFor="pr-hours"
          error={errors.initialHours?.message}
          hint={
            printer
              ? `Total atual: ${formatNumber(printer.totalHours, 1)} h (estas + impressões registradas)`
              : 'Contador da impressora hoje. As impressões registradas somam a partir daqui.'
          }
        >
          <Input
            id="pr-hours"
            inputMode="decimal"
            invalid={!!errors.initialHours}
            {...register('initialHours')}
          />
        </Field>
      </div>
      <Field label="Observações" htmlFor="pr-notes">
        <Textarea id="pr-notes" rows={2} {...register('notes')} />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={printer ? 'Salvar' : 'Cadastrar'}
        loading={mutation.isPending}
      />
    </form>
  );
}

/** Muda a situação operacional: disponível, em manutenção ou inativa. */
export function PrinterStatusModal({
  printer,
  onClose,
}: {
  printer: PrinterSummary | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!printer} onClose={onClose} title="Situação da impressora" size="sm">
      {printer && <StatusForm key={printer.id} printer={printer} onDone={onClose} />}
    </Modal>
  );
}

function StatusForm({ printer, onDone }: { printer: PrinterSummary; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<{ status: PrinterStatus; reason: string }>({
    defaultValues: { status: printer.status, reason: '' },
  });
  const mutation = useMutation({
    mutationFn: (v: { status: PrinterStatus; reason: string }) =>
      printersApi.setStatus(printer.id, v),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printers'] });
      toast.success('Situação atualizada.');
      onDone();
    },
    onError: (error) => setFormError(toApiRequestError(error).message),
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        setFormError(null);
        mutation.mutate(v);
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      {printer.activeJob && (
        <Alert tone="info">
          Há uma impressão em andamento. Finalize-a antes de mudar a situação.
        </Alert>
      )}
      <Field label={printer.code} htmlFor="ps-status">
        <Select id="ps-status" {...register('status')}>
          {PRINTER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PRINTER_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Motivo" htmlFor="ps-reason" hint="Fica registrado na auditoria">
        <Input id="ps-reason" placeholder="Ex.: troca do bico" {...register('reason')} />
      </Field>
      <FormFooter onCancel={onDone} submitLabel="Salvar" loading={mutation.isPending} />
    </form>
  );
}
