import type { RollSummary } from '@alipe3d/shared';
import { useMutation } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { toApiRequestError } from '@/services/api';
import { formatGrams } from '@/utils/format';
import { materialsApi } from './inventory.api';
import { useInvalidateStock } from './inventory-ui';

/** Conferência por pesagem: o sistema desconta o carretel e lança a diferença como ajuste. */
export function WeighRollModal({
  roll,
  onClose,
}: {
  roll: RollSummary | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!roll}
      onClose={onClose}
      title={`Pesar rolo ${roll?.code ?? ''}`}
      description={roll?.material.name}
      size="sm"
    >
      {roll && <WeighForm key={roll.id} roll={roll} onDone={onClose} />}
    </Modal>
  );
}

function WeighForm({ roll, onDone }: { roll: RollSummary; onDone: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control } = useForm({
    defaultValues: { grossWeightGrams: '', notes: '' },
  });
  const gross = Number(useWatch({ control, name: 'grossWeightGrams' }).replace(',', '.')) || 0;
  const net = gross - Number(roll.spoolWeightGrams);

  const mutation = useMutation({
    mutationFn: (v: { grossWeightGrams: string; notes: string }) =>
      materialsApi.weighRoll(roll.id, v),
    onSuccess: async (result) => {
      await invalidate();
      toast.success(
        result.changed
          ? `Saldo ajustado para ${formatGrams(result.remainingWeightGrams)} (${Number(result.difference) > 0 ? '+' : ''}${formatGrams(result.difference)}).`
          : 'Pesagem confere com o saldo. Nada foi alterado.',
      );
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
      <p className="text-sm text-ink-muted">
        Coloque o rolo (com o carretel) na balança e informe o peso. O carretel vazio pesa{' '}
        <strong className="text-ink">{formatGrams(roll.spoolWeightGrams)}</strong>.
      </p>
      <Field label="Peso na balança (g)" htmlFor="w-gross" required>
        <Input
          id="w-gross"
          inputMode="decimal"
          autoFocus
          {...register('grossWeightGrams', { required: true })}
        />
      </Field>
      <Field label="Observação" htmlFor="w-notes">
        <Input id="w-notes" {...register('notes')} />
      </Field>
      {gross > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-canvas px-4 py-3 text-sm">
          <Scale className="size-4 text-ink-muted" aria-hidden="true" />
          Filamento: <strong>{net >= 0 ? formatGrams(net) : '—'}</strong>
          <span className="text-ink-muted">
            (sistema: {formatGrams(roll.remainingWeightGrams)})
          </span>
        </div>
      )}
      <FormFooter onCancel={onDone} submitLabel="Conferir saldo" loading={mutation.isPending} />
    </form>
  );
}
