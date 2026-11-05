import {
  createRollSchema,
  updateRollSchema,
  type CreateRollInput,
  type RollSummary,
  type UpdateRollInput,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Field, Input, Select } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { toApiRequestError } from '@/services/api';
import { applyServerErrors } from '@/utils/form';
import { formatCurrency, formatUnitCost, todayIso } from '@/utils/format';
import { toInput } from '../products/product-ui';
import { inventoryKeys, materialsApi, suppliersApi } from './inventory.api';
import { useInvalidateStock } from './inventory-ui';

/** Cadastro de rolos novos (gera a entrada por compra). */
export function RollFormModal({
  open,
  materialId,
  onClose,
}: {
  open: boolean;
  materialId?: string | undefined;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cadastrar rolos"
      description="Cada rolo recebe um código (R-0001) para etiquetar o carretel."
      size="lg"
    >
      {open && <CreateRollForm materialId={materialId} onDone={onClose} />}
    </Modal>
  );
}

const CREATE_FIELDS = [
  'materialId',
  'supplierId',
  'initialWeightGrams',
  'spoolWeightGrams',
  'purchaseCost',
  'purchasedAt',
  'lotNumber',
  'quantity',
] as const;

function CreateRollForm({
  materialId,
  onDone,
}: {
  materialId?: string | undefined;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [formError, setFormError] = useState<string | null>(null);
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: suppliersApi.list });
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<CreateRollInput>({
    resolver: zodResolver(createRollSchema),
    defaultValues: {
      materialId: materialId ?? '',
      supplierId: '',
      initialWeightGrams: '1000',
      spoolWeightGrams: '250',
      purchaseCost: '',
      purchasedAt: todayIso(),
      lotNumber: '',
      quantity: 1,
    },
  });
  const rollCount = Number(useWatch({ control, name: 'quantity' }));
  const cost = Number(String(useWatch({ control, name: 'purchaseCost' }) ?? '').replace(',', '.'));
  const weight = Number(
    String(useWatch({ control, name: 'initialWeightGrams' }) ?? '').replace(',', '.'),
  );

  const mutation = useMutation({
    mutationFn: materialsApi.createRolls,
    onSuccess: async (rolls) => {
      await invalidate();
      toast.success(
        rolls.length === 1
          ? `Rolo ${rolls[0]?.code} cadastrado.`
          : `${rolls.length} rolos cadastrados (${rolls[0]?.code} a ${rolls.at(-1)?.code}).`,
      );
      onDone();
    },
    onError: (error) => setFormError(applyServerErrors(error, setError, CREATE_FIELDS)),
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
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Filamento" htmlFor="r-material" error={errors.materialId?.message} required>
          <Select id="r-material" invalid={!!errors.materialId} {...register('materialId')}>
            <option value="">Escolha o filamento</option>
            {materials.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.manufacturer})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Quantidade de rolos"
          htmlFor="r-qty"
          error={errors.quantity?.message}
          hint="Rolos iguais da mesma compra"
        >
          <Input id="r-qty" inputMode="numeric" {...register('quantity')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Peso de filamento (g)"
          htmlFor="r-initial"
          error={errors.initialWeightGrams?.message}
          required
          hint="Peso líquido do rolo"
        >
          <Input id="r-initial" inputMode="decimal" {...register('initialWeightGrams')} />
        </Field>
        <Field
          label="Carretel vazio (g)"
          htmlFor="r-spool"
          error={errors.spoolWeightGrams?.message}
          required
          hint="Usado nas pesagens"
        >
          <Input id="r-spool" inputMode="decimal" {...register('spoolWeightGrams')} />
        </Field>
        <Field
          label="Custo por rolo (R$)"
          htmlFor="r-cost"
          error={errors.purchaseCost?.message}
          required
          hint={cost > 0 && weight > 0 ? `${formatUnitCost(cost / weight)}/g` : undefined}
        >
          <Input
            id="r-cost"
            inputMode="decimal"
            placeholder="0,00"
            invalid={!!errors.purchaseCost}
            {...register('purchaseCost')}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fornecedor" htmlFor="r-supplier" error={errors.supplierId?.message}>
          <Select id="r-supplier" {...register('supplierId')}>
            <option value="">Não informado</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Data de entrada"
          htmlFor="r-date"
          error={errors.purchasedAt?.message}
          required
        >
          <Input id="r-date" type="date" max={todayIso()} {...register('purchasedAt')} />
        </Field>
        <Field label="Lote" htmlFor="r-lot" error={errors.lotNumber?.message}>
          <Input id="r-lot" {...register('lotNumber')} />
        </Field>
      </div>
      {cost > 0 && rollCount > 1 && (
        <p className="text-sm text-ink-muted">
          Total da compra: {formatCurrency(cost * rollCount)}
        </p>
      )}
      <FormFooter onCancel={onDone} submitLabel="Cadastrar" loading={mutation.isPending} />
    </form>
  );
}

/** Edição dos dados do rolo (o saldo só muda por movimentação). */
export function EditRollModal({
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
      title={`Editar rolo ${roll?.code ?? ''}`}
      description="O saldo só muda por movimentação ou pesagem."
    >
      {roll && <EditRollForm key={roll.id} roll={roll} onDone={onClose} />}
    </Modal>
  );
}

function EditRollForm({ roll, onDone }: { roll: RollSummary; onDone: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [formError, setFormError] = useState<string | null>(null);
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: suppliersApi.list });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateRollInput>({
    resolver: zodResolver(updateRollSchema),
    defaultValues: {
      supplierId: roll.supplier?.id ?? '',
      spoolWeightGrams: toInput(roll.spoolWeightGrams),
      lotNumber: roll.lotNumber ?? '',
      notes: roll.notes ?? '',
      status: roll.status === 'EMPTY' ? undefined : roll.status,
    },
  });
  const mutation = useMutation({
    mutationFn: (v: UpdateRollInput) => materialsApi.updateRoll(roll.id, v),
    onSuccess: async () => {
      await invalidate();
      toast.success('Rolo atualizado.');
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
        <Field label="Fornecedor" htmlFor="er-supplier">
          <Select id="er-supplier" {...register('supplierId')}>
            <option value="">Não informado</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Carretel vazio (g)"
          htmlFor="er-spool"
          error={errors.spoolWeightGrams?.message}
        >
          <Input id="er-spool" inputMode="decimal" {...register('spoolWeightGrams')} />
        </Field>
        <Field label="Lote" htmlFor="er-lot">
          <Input id="er-lot" {...register('lotNumber')} />
        </Field>
        {roll.status !== 'EMPTY' && (
          <Field
            label="Situação"
            htmlFor="er-status"
            hint="Para descartar, zere o saldo antes (perda ou desperdício)"
          >
            <Select id="er-status" {...register('status')}>
              <option value="IN_STOCK">Lacrado</option>
              <option value="IN_USE">Em uso</option>
              <option value="DISCARDED">Descartado</option>
            </Select>
          </Field>
        )}
      </div>
      <Field label="Observações" htmlFor="er-notes">
        <Input id="er-notes" {...register('notes')} />
      </Field>
      <FormFooter onCancel={onDone} submitLabel="Salvar" loading={mutation.isPending} />
    </form>
  );
}
