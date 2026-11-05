import {
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPES,
  maintenanceInputSchema,
  type MaintenanceEntry,
  type MaintenanceInput,
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
import { useAuth } from '@/contexts/AuthContext';
import { applyServerErrors } from '@/utils/form';
import { todayIso } from '@/utils/format';
import { maintenanceApi } from './printers.api';

const FIELDS = [
  'type',
  'description',
  'performedAt',
  'responsibleName',
  'partsReplaced',
  'cost',
  'nextMaintenanceAt',
] as const;

interface MaintenanceFormModalProps {
  open: boolean;
  printerId: string;
  printerCode: string;
  entry: MaintenanceEntry | null;
  onClose: () => void;
}

export function MaintenanceFormModal({
  open,
  printerId,
  printerCode,
  entry,
  onClose,
}: MaintenanceFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Editar manutenção' : 'Registrar manutenção'}
      description={printerCode}
    >
      <MaintenanceForm
        key={entry?.id ?? 'new'}
        printerId={printerId}
        entry={entry}
        onDone={onClose}
      />
    </Modal>
  );
}

function MaintenanceForm({
  printerId,
  entry,
  onDone,
}: {
  printerId: string;
  entry: MaintenanceEntry | null;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MaintenanceInput>({
    resolver: zodResolver(maintenanceInputSchema),
    defaultValues: {
      printerId,
      type: entry?.type ?? 'PREVENTIVE',
      description: entry?.description ?? '',
      performedAt: entry?.performedAt ?? todayIso(),
      responsibleName: entry?.responsibleName ?? user?.name ?? '',
      partsReplaced: entry?.partsReplaced ?? '',
      cost: entry ? entry.cost.replace('.', ',') : '0',
      nextMaintenanceAt: entry?.nextMaintenanceAt ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: MaintenanceInput) =>
      entry ? maintenanceApi.update(entry.id, values) : maintenanceApi.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printers'] });
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(entry ? 'Manutenção atualizada.' : 'Manutenção registrada.');
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
        <Field label="Tipo" htmlFor="mt-type" error={errors.type?.message} required>
          <Select id="mt-type" {...register('type')}>
            {MAINTENANCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {MAINTENANCE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data" htmlFor="mt-date" error={errors.performedAt?.message} required>
          <Input id="mt-date" type="date" max={todayIso()} {...register('performedAt')} />
        </Field>
      </div>
      <Field
        label="O que foi feito"
        htmlFor="mt-description"
        error={errors.description?.message}
        required
      >
        <Textarea
          id="mt-description"
          rows={2}
          autoFocus
          placeholder="Ex.: limpeza do bico, lubrificação dos eixos, nivelamento"
          invalid={!!errors.description}
          {...register('description')}
        />
      </Field>
      <Field label="Peças substituídas" htmlFor="mt-parts" error={errors.partsReplaced?.message}>
        <Input id="mt-parts" placeholder="Ex.: bico 0,4 mm" {...register('partsReplaced')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Responsável"
          htmlFor="mt-responsible"
          error={errors.responsibleName?.message}
          required
        >
          <Input
            id="mt-responsible"
            invalid={!!errors.responsibleName}
            {...register('responsibleName')}
          />
        </Field>
        <Field label="Custo (R$)" htmlFor="mt-cost" error={errors.cost?.message}>
          <Input id="mt-cost" inputMode="decimal" invalid={!!errors.cost} {...register('cost')} />
        </Field>
      </div>
      <Field
        label="Próxima manutenção prevista"
        htmlFor="mt-next"
        error={errors.nextMaintenanceAt?.message}
        hint="Gera um alerta 7 dias antes"
      >
        <Input id="mt-next" type="date" {...register('nextMaintenanceAt')} />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={entry ? 'Salvar' : 'Registrar'}
        loading={mutation.isPending}
      />
    </form>
  );
}
