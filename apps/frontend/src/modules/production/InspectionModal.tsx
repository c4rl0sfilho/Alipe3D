import type { ProductionOrderDetail, StockUnit } from '@alipe3d/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatStock } from '@/modules/inventory/inventory-ui';
import { toApiRequestError } from '@/services/api';
import { productionApi, productionKeys, useInvalidateProduction } from './production.api';

interface FormValues {
  approvedQuantity: string;
  rejectedQuantity: string;
  reprintRejected: boolean;
  notes: string;
  allowNegative: boolean;
}

/** Inspeção: aprovadas entram no estoque de produto acabado; reprovadas podem ser refeitas. */
export function InspectionModal({
  order,
  onClose,
}: {
  order: ProductionOrderDetail | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Inspeção · ${order?.code ?? ''}`}
      description={order ? `${order.pendingInspection} peça(s) aguardando inspeção` : undefined}
    >
      {order && <InspectionForm key={order.id} order={order} onDone={onClose} />}
    </Modal>
  );
}

function InspectionForm({ order, onDone }: { order: ProductionOrderDetail; onDone: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProduction();
  const [formError, setFormError] = useState<string | null>(null);
  const [needsNegative, setNeedsNegative] = useState(false);
  const { register, handleSubmit, control } = useForm<FormValues>({
    defaultValues: {
      approvedQuantity: String(order.pendingInspection),
      rejectedQuantity: '0',
      reprintRejected: true,
      notes: '',
      allowNegative: false,
    },
  });
  const approved = Number(useWatch({ control, name: 'approvedQuantity' })) || 0;
  const rejected = Number(useWatch({ control, name: 'rejectedQuantity' })) || 0;
  const total = approved + rejected;

  const mutation = useMutation({
    mutationFn: (v: FormValues) => productionApi.inspect(order.id, v),
    onSuccess: async (saved) => {
      queryClient.setQueryData(productionKeys.order(order.id), saved);
      await invalidate();
      toast.success(
        approved > 0
          ? `${approved} peça(s) entraram no estoque de produto acabado.`
          : 'Inspeção registrada.',
      );
      onDone();
    },
    onError: (error) => {
      const message = toApiRequestError(error).message;
      if (message.includes('Saldo insuficiente')) setNeedsNegative(true);
      setFormError(message);
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        setFormError(null);
        if (total < 1 || total > order.pendingInspection) {
          setFormError(`Aprovadas + reprovadas deve ficar entre 1 e ${order.pendingInspection}.`);
          return;
        }
        mutation.mutate(v);
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aprovadas" htmlFor="in-approved" required>
          <Input
            id="in-approved"
            type="number"
            min={0}
            max={order.pendingInspection}
            autoFocus
            {...register('approvedQuantity')}
          />
        </Field>
        <Field label="Reprovadas" htmlFor="in-rejected">
          <Input
            id="in-rejected"
            type="number"
            min={0}
            max={order.pendingInspection}
            {...register('rejectedQuantity')}
          />
        </Field>
      </div>
      {rejected > 0 && (
        <Checkbox
          id="in-reprint"
          label="Refazer as peças reprovadas"
          description="A ordem volta para a fila para imprimir as que faltam. Sem marcar, a ordem segue com menos peças."
          {...register('reprintRejected')}
        />
      )}
      <Field label="Observações" htmlFor="in-notes">
        <Textarea
          id="in-notes"
          rows={2}
          placeholder="Ex.: 1 peça com marca na base"
          {...register('notes')}
        />
      </Field>

      {approved > 0 && (
        <div className="rounded-lg bg-canvas px-4 py-3 text-sm">
          <p>
            Entrada no estoque: <strong>{approved} peça(s)</strong>
          </p>
          {order.supplies.length > 0 && (
            <p className="mt-1 text-ink-muted">
              Baixa dos insumos da ficha técnica:{' '}
              {order.supplies
                .map(
                  (s) =>
                    `${formatStock(Number(s.quantityPerUnit) * approved, s.unit as StockUnit)} de ${s.name}`,
                )
                .join(', ')}
            </p>
          )}
        </div>
      )}

      {needsNegative && can('inventory:allow-negative') && (
        <Checkbox
          id="in-negative"
          label="Autorizar saldo negativo dos insumos"
          description="Exceção administrativa. Fica registrada na auditoria com o seu usuário."
          {...register('allowNegative')}
        />
      )}
      <FormFooter onCancel={onDone} submitLabel="Registrar inspeção" loading={mutation.isPending} />
    </form>
  );
}

/** Motivo para cancelar ou encerrar uma ordem. */
export function ReasonModal({
  open,
  title,
  description,
  submitLabel,
  loading,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  loading: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {open && (
        <ReasonForm
          description={description}
          submitLabel={submitLabel}
          loading={loading}
          error={error}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}

function ReasonForm({
  description,
  submitLabel,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  description: string;
  submitLabel: string;
  loading: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { reason: '' } });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => onSubmit(v.reason))}>
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-ink-muted">{description}</p>
      <Field label="Motivo" htmlFor="rs-reason" error={errors.reason?.message} required>
        <Input
          id="rs-reason"
          autoFocus
          invalid={!!errors.reason}
          {...register('reason', {
            validate: (v) => v.trim().length >= 3 || 'Informe o motivo (mínimo 3 caracteres)',
          })}
        />
      </Field>
      <FormFooter onCancel={onCancel} submitLabel={submitLabel} loading={loading} />
    </form>
  );
}
