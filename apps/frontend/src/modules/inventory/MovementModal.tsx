import {
  ALLOWED_MOVEMENTS,
  MOVEMENT_DIRECTION,
  MOVEMENT_TYPE_LABELS,
  type ManualMovementType,
  type StockTargetKind,
  type StockUnit,
} from '@alipe3d/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, Input, Select } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { toApiRequestError } from '@/services/api';
import { todayIso } from '@/utils/format';
import { stockApi } from './inventory.api';
import { formatStock, useInvalidateStock } from './inventory-ui';

export interface MovementTarget {
  kind: StockTargetKind;
  id: string;
  label: string;
  unit: StockUnit | 'g';
  balance: string;
}

interface FormValues {
  type: ManualMovementType;
  direction: 'IN' | 'OUT';
  quantity: string;
  unitCost: string;
  occurredAt: string;
  reason: string;
  allowNegative: boolean;
}

const PLACEHOLDERS: Partial<Record<ManualMovementType, string>> = {
  PRODUCTION_OUT: 'Ex.: impressão de 2 suportes',
  LOSS: 'Ex.: rolo úmido descartado',
  WASTE: 'Ex.: falha na primeira camada',
  ADJUSTMENT: 'Ex.: contagem física / estoque inicial',
  PURCHASE_IN: 'Ex.: NF 1234 — Fornecedor X',
  RETURN_IN: 'Ex.: devolução do pedido 1234',
  RETURN_OUT: 'Ex.: troca com o fornecedor',
};

/** Registro manual de movimentação para rolo, insumo ou produto acabado. */
export function MovementModal({
  target,
  onClose,
}: {
  target: MovementTarget | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Registrar movimentação"
      description={target?.label}
    >
      {target && <MovementForm key={target.id} target={target} onDone={onClose} />}
    </Modal>
  );
}

function MovementForm({ target, onDone }: { target: MovementTarget; onDone: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [formError, setFormError] = useState<string | null>(null);

  // Ajuste só aparece para quem tem a permissão
  const types = ALLOWED_MOVEMENTS[target.kind].filter(
    (t) => t !== 'ADJUSTMENT' || can('inventory:adjust'),
  );
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      type: types[0],
      direction: 'IN',
      quantity: '',
      unitCost: '',
      occurredAt: todayIso(),
      reason: '',
      allowNegative: false,
    },
  });
  const type = useWatch({ control, name: 'type' });
  const direction = useWatch({ control, name: 'direction' });
  const quantity = Number(useWatch({ control, name: 'quantity' }).replace(',', '.')) || 0;
  const sign = type === 'ADJUSTMENT' ? (direction === 'IN' ? 1 : -1) : MOVEMENT_DIRECTION[type];
  const after = Number(target.balance) + sign * quantity;

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      stockApi.registerMovement({
        ...(target.kind === 'ROLL' ? { rollId: target.id } : { stockItemId: target.id }),
        type: v.type,
        direction: v.type === 'ADJUSTMENT' ? v.direction : undefined,
        quantity: v.quantity,
        unitCost: v.type === 'PURCHASE_IN' ? v.unitCost : '',
        occurredAt: v.occurredAt,
        reason: v.reason,
        allowNegative: v.allowNegative,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Movimentação registrada.');
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="m-type">
          <Select id="m-type" {...register('type')}>
            {types.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'ADJUSTMENT' ? (
          <Field label="Sentido do ajuste" htmlFor="m-direction">
            <Select id="m-direction" {...register('direction')}>
              <option value="IN">Entrada (aumenta o saldo)</option>
              <option value="OUT">Saída (diminui o saldo)</option>
            </Select>
          </Field>
        ) : (
          <Field label="Data" htmlFor="m-date">
            <Input id="m-date" type="date" max={todayIso()} {...register('occurredAt')} />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Quantidade (${target.unit === 'g' ? 'gramas' : 'unidades do item'})`}
          htmlFor="m-qty"
          error={errors.quantity?.message}
          required
        >
          <Input
            id="m-qty"
            inputMode="decimal"
            autoFocus
            invalid={!!errors.quantity}
            {...register('quantity', {
              validate: (v) =>
                Number(v.replace(',', '.')) > 0 || 'Informe uma quantidade maior que zero',
            })}
          />
        </Field>
        {type === 'PURCHASE_IN' && (
          <Field
            label="Custo unitário (R$)"
            htmlFor="m-cost"
            hint="Atualiza o custo médio do insumo"
          >
            <Input id="m-cost" inputMode="decimal" placeholder="0,00" {...register('unitCost')} />
          </Field>
        )}
        {type === 'ADJUSTMENT' && (
          <Field label="Data" htmlFor="m-date">
            <Input id="m-date" type="date" max={todayIso()} {...register('occurredAt')} />
          </Field>
        )}
      </div>

      <Field label="Motivo / observação" htmlFor="m-reason" error={errors.reason?.message} required>
        <Input
          id="m-reason"
          placeholder={PLACEHOLDERS[type]}
          invalid={!!errors.reason}
          {...register('reason', {
            validate: (v) => v.trim().length >= 3 || 'Descreva o motivo (mínimo 3 caracteres)',
          })}
        />
      </Field>

      <div className="rounded-lg bg-canvas px-4 py-3 text-sm">
        Saldo atual <strong>{formatStock(target.balance, target.unit)}</strong> → após o lançamento{' '}
        <strong className={after < 0 ? 'text-danger' : undefined}>
          {formatStock(after, target.unit)}
        </strong>
      </div>

      {after < 0 &&
        (can('inventory:allow-negative') ? (
          <Checkbox
            id="m-negative"
            label="Autorizar saldo negativo"
            description="Exceção administrativa. Fica registrada na auditoria com o seu usuário."
            {...register('allowNegative')}
          />
        ) : (
          <Alert tone="error">
            O saldo ficaria negativo. Confira a quantidade ou registre antes a entrada que está
            faltando.
          </Alert>
        ))}

      <FormFooter onCancel={onDone} submitLabel="Registrar" loading={mutation.isPending} />
    </form>
  );
}
