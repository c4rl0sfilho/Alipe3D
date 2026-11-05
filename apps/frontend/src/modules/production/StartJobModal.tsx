import {
  PRINTER_ACTIVITY_LABELS,
  type ProductionOrderSummary,
  type StartPrintJobInput,
} from '@alipe3d/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { inventoryKeys, materialsApi } from '@/modules/inventory/inventory.api';
import { printerLabel } from '@/modules/printers/printer-ui';
import { printerKeys, printersApi } from '@/modules/printers/printers.api';
import { toApiRequestError } from '@/services/api';
import { formatGrams, localInputToIso, toLocalInput } from '@/utils/format';
import { productionApi, useInvalidateProduction } from './production.api';
import { orderProductLabel } from './production-ui';

interface FormValues {
  printerId: string;
  rollId: string;
  plannedQuantity: string;
  estimatedGrams: string;
  estimatedMinutes: string;
  startedAt: string;
  notes: string;
}

/** Iniciar impressão: impressora, rolo carregado e quantidade desta mesa. */
export function StartJobModal({
  order,
  onClose,
}: {
  order: ProductionOrderSummary | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Iniciar impressão · ${order?.code ?? ''}`}
      description={order ? orderProductLabel(order) : undefined}
    >
      {order && <StartForm key={order.id} order={order} onDone={onClose} />}
    </Modal>
  );
}

function StartForm({ order, onDone }: { order: ProductionOrderSummary; onDone: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateProduction();
  const [formError, setFormError] = useState<string | null>(null);
  const [anyMaterial, setAnyMaterial] = useState(!order.material);

  // Estimativa por peça a partir da ordem (tempo e peso totais ÷ quantidade)
  const unitGrams = Number(order.estimatedWeightGrams) / order.quantity;
  const unitMinutes = order.estimatedMinutes / order.quantity;
  const estimate = (qty: number) => ({
    grams: (Math.round(unitGrams * qty * 100) / 100).toString().replace('.', ','),
    minutes: String(Math.round(unitMinutes * qty)),
  });

  const printers = useQuery({ queryKey: printerKeys.list, queryFn: printersApi.list });
  const rollsQuery = {
    status: 'available' as const,
    materialId: anyMaterial ? undefined : order.material?.id,
    pageSize: 100,
  };
  const rolls = useQuery({
    queryKey: inventoryKeys.rolls(rollsQuery),
    queryFn: () => materialsApi.listRolls(rollsQuery),
  });

  const initial = estimate(order.remainingToPrint);
  const { register, handleSubmit, control, setValue } = useForm<FormValues>({
    defaultValues: {
      printerId: order.printer?.id ?? '',
      rollId: '',
      plannedQuantity: String(order.remainingToPrint),
      estimatedGrams: initial.grams,
      estimatedMinutes: initial.minutes,
      startedAt: toLocalInput(),
      notes: '',
    },
  });
  const rollId = useWatch({ control, name: 'rollId' });
  const grams = Number(useWatch({ control, name: 'estimatedGrams' }).replace(',', '.')) || 0;
  const roll = rolls.data?.items.find((r) => r.id === rollId);

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      productionApi.startJob(order.id, {
        printerId: v.printerId,
        rollId: v.rollId,
        plannedQuantity: v.plannedQuantity,
        estimatedGrams: v.estimatedGrams,
        estimatedMinutes: v.estimatedMinutes,
        startedAt: localInputToIso(v.startedAt),
        notes: v.notes,
      } satisfies StartPrintJobInput),
    onSuccess: async () => {
      await invalidate();
      toast.success('Impressão iniciada. A impressora está ocupada até a finalização.');
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
        if (!v.printerId || !v.rollId) {
          setFormError('Escolha a impressora e o rolo carregado.');
          return;
        }
        mutation.mutate(v);
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Field label="Impressora" htmlFor="sj-printer" required>
        <Select id="sj-printer" {...register('printerId')}>
          <option value="">Escolha a impressora</option>
          {printers.data?.map((p) => (
            <option key={p.id} value={p.id} disabled={p.activity !== 'AVAILABLE'}>
              {printerLabel(p)}
              {p.activity !== 'AVAILABLE' ? ` (${PRINTER_ACTIVITY_LABELS[p.activity]})` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Rolo carregado"
        htmlFor="sj-roll"
        required
        hint={
          order.material
            ? `Filamento planejado: ${order.material.name} · ${order.material.color}`
            : undefined
        }
      >
        <Select id="sj-roll" {...register('rollId')}>
          <option value="">
            {rolls.isFetching
              ? 'Carregando...'
              : rolls.data?.items.length
                ? 'Escolha o rolo'
                : 'Nenhum rolo com saldo'}
          </option>
          {rolls.data?.items.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} · {r.material.name} · {formatGrams(r.remainingWeightGrams)}
            </option>
          ))}
        </Select>
      </Field>
      {order.material && (
        <Checkbox
          id="sj-any"
          label="Mostrar rolos de outros filamentos"
          checked={anyMaterial}
          onChange={(e) => setAnyMaterial(e.target.checked)}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Peças" htmlFor="sj-qty" required hint={`Faltam ${order.remainingToPrint}`}>
          <Input
            id="sj-qty"
            type="number"
            min={1}
            max={order.remainingToPrint}
            {...register('plannedQuantity', {
              onChange: (e: { target: { value: string } }) => {
                const next = estimate(Number(e.target.value) || 0);
                setValue('estimatedGrams', next.grams);
                setValue('estimatedMinutes', next.minutes);
              },
            })}
          />
        </Field>
        <Field label="Filamento (g)" htmlFor="sj-grams">
          <Input id="sj-grams" inputMode="decimal" {...register('estimatedGrams')} />
        </Field>
        <Field label="Tempo (min)" htmlFor="sj-minutes">
          <Input id="sj-minutes" inputMode="numeric" {...register('estimatedMinutes')} />
        </Field>
      </div>

      {roll && grams > Number(roll.remainingWeightGrams) && (
        <Alert tone="info">
          O rolo {roll.code} tem {formatGrams(roll.remainingWeightGrams)} e a impressão estima{' '}
          {formatGrams(grams)}. Deixe outro rolo à mão: na finalização você informa quanto saiu de
          cada um.
        </Alert>
      )}

      <Field label="Início" htmlFor="sj-start" hint="Ajuste se a impressão começou antes">
        <Input
          id="sj-start"
          type="datetime-local"
          max={toLocalInput()}
          {...register('startedAt')}
        />
      </Field>
      <Field label="Observações" htmlFor="sj-notes">
        <Textarea
          id="sj-notes"
          rows={2}
          placeholder="Ex.: perfil 0,2 mm, mesa texturizada"
          {...register('notes')}
        />
      </Field>
      <p className="text-xs text-ink-muted">
        O filamento é baixado do estoque só na finalização, pelo peso real informado.
      </p>
      <FormFooter onCancel={onDone} submitLabel="Iniciar impressão" loading={mutation.isPending} />
    </form>
  );
}
