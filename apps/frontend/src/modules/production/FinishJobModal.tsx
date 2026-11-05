import {
  FAILURE_REASON_LABELS,
  FAILURE_REASONS,
  PRODUCTION_STATUS_LABELS,
  type FailureReason,
  type FinishPrintJobInput,
} from '@alipe3d/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNow } from '@/hooks/use-now';
import { inventoryKeys, materialsApi } from '@/modules/inventory/inventory.api';
import { toApiRequestError } from '@/services/api';
import { cn } from '@/utils/cn';
import { elapsedSeconds, formatGrams, localInputToIso, toLocalInput } from '@/utils/format';
import { productionApi, useInvalidateProduction } from './production.api';

export type FinishMode = 'SUCCESS' | 'FAILED';

/** Dados da impressão em andamento necessários para finalizá-la. */
export interface FinishTarget {
  jobId: string;
  orderCode: string;
  plannedQuantity: number;
  estimatedGrams: string;
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
  roll: { id: string; code: string; materialName: string };
  mode: FinishMode;
}

interface FormValues {
  finishedAt: string;
  producedQuantity: string;
  consumption: { rollId: string; grams: string }[];
  failureReason: FailureReason;
  failureNotes: string;
  lostMinutes: string;
  needsReprint: boolean;
  notes: string;
  allowNegative: boolean;
}

export function FinishJobModal({
  target,
  onClose,
}: {
  target: FinishTarget | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="lg"
      title={`Finalizar impressão · ${target?.orderCode ?? ''}`}
      description="O filamento informado é baixado dos rolos agora, uma única vez."
    >
      {target && <FinishForm key={target.jobId} target={target} onDone={onClose} />}
    </Modal>
  );
}

function FinishForm({ target, onDone }: { target: FinishTarget; onDone: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateProduction();
  const [mode, setMode] = useState<FinishMode>(target.mode);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsNegative, setNeedsNegative] = useState(false);

  const rollsQuery = { status: 'available' as const, pageSize: 100 };
  const rolls = useQuery({
    queryKey: inventoryKeys.rolls(rollsQuery),
    queryFn: () => materialsApi.listRolls(rollsQuery),
  });
  // O rolo da impressão aparece mesmo que tenha acabado durante ela
  const rollOptions = [
    ...(rolls.data?.items.some((r) => r.id === target.roll.id)
      ? []
      : [{ id: target.roll.id, label: `${target.roll.code} · ${target.roll.materialName}` }]),
    ...(rolls.data?.items.map((r) => ({
      id: r.id,
      label: `${r.code} · ${r.material.name} · ${formatGrams(r.remainingWeightGrams)}`,
    })) ?? []),
  ];

  const now = useNow();
  const reference = target.pausedAt ? new Date(target.pausedAt).getTime() : now;
  const elapsedMinutes = Math.round(
    elapsedSeconds(target.startedAt, reference, target.pausedSeconds) / 60,
  );
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      finishedAt: toLocalInput(),
      producedQuantity: String(target.plannedQuantity),
      consumption: [
        {
          rollId: target.roll.id,
          grams: target.mode === 'SUCCESS' ? target.estimatedGrams.replace('.', ',') : '',
        },
      ],
      failureReason: 'BED_ADHESION',
      failureNotes: '',
      lostMinutes: '',
      needsReprint: true,
      notes: '',
      allowNegative: false,
    },
  });
  const lines = useFieldArray({ control, name: 'consumption' });

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const consumption = v.consumption
        .filter((line) => line.rollId && line.grams.trim() !== '')
        .map((line) => ({ rollId: line.rollId, grams: line.grams }));
      const common = {
        finishedAt: localInputToIso(v.finishedAt),
        notes: v.notes,
        allowNegative: v.allowNegative,
        consumption,
      };
      const input: FinishPrintJobInput =
        mode === 'SUCCESS'
          ? { result: 'SUCCESS', producedQuantity: v.producedQuantity, ...common }
          : {
              result: 'FAILED',
              failureReason: v.failureReason,
              failureNotes: v.failureNotes,
              lostMinutes: v.lostMinutes,
              needsReprint: v.needsReprint,
              ...common,
            };
      return productionApi.finishJob(target.jobId, input);
    },
    onSuccess: async (result) => {
      await invalidate();
      toast.success(
        `Impressão ${mode === 'SUCCESS' ? 'concluída' : 'registrada como falha'}. Ordem: ${PRODUCTION_STATUS_LABELS[result.orderStatus]}.`,
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
        mutation.mutate(v);
      })}
    >
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-canvas p-1" role="radiogroup">
        {(['SUCCESS', 'FAILED'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === option
                ? option === 'SUCCESS'
                  ? 'bg-surface text-success shadow-sm'
                  : 'bg-surface text-danger shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {option === 'SUCCESS' ? 'Concluída' : 'Falhou'}
          </button>
        ))}
      </div>

      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Término" htmlFor="fj-end" required>
          <Input
            id="fj-end"
            type="datetime-local"
            max={toLocalInput()}
            {...register('finishedAt')}
          />
        </Field>
        {mode === 'SUCCESS' ? (
          <Field
            label="Peças produzidas"
            htmlFor="fj-produced"
            required
            hint={`Iniciada para ${target.plannedQuantity}`}
            error={errors.producedQuantity?.message}
          >
            <Input
              id="fj-produced"
              type="number"
              min={1}
              max={target.plannedQuantity}
              invalid={!!errors.producedQuantity}
              {...register('producedQuantity', {
                validate: (v) =>
                  (Number(v) >= 1 && Number(v) <= target.plannedQuantity) ||
                  `Entre 1 e ${target.plannedQuantity}`,
              })}
            />
          </Field>
        ) : (
          <Field label="Motivo da falha" htmlFor="fj-reason" required>
            <Select id="fj-reason" {...register('failureReason')}>
              {FAILURE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {FAILURE_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {mode === 'SUCCESS' ? 'Peso real consumido' : 'Material desperdiçado'}
        </legend>
        <p className="text-xs text-ink-muted">
          {mode === 'SUCCESS'
            ? 'Use o peso do fatiador ou a diferença na balança. Se trocou de rolo, informe cada um.'
            : 'Quanto filamento foi perdido. Deixe vazio se a falha aconteceu antes de extrudar.'}
        </p>
        {lines.fields.map((line, index) => (
          <div key={line.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Select aria-label={`Rolo ${index + 1}`} {...register(`consumption.${index}.rollId`)}>
                <option value="">Escolha o rolo</option>
                {rollOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="relative w-28 shrink-0">
              <Input
                aria-label={`Gramas do rolo ${index + 1}`}
                inputMode="decimal"
                className="pr-7"
                {...register(`consumption.${index}.grams`)}
              />
              <span
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-muted"
                aria-hidden="true"
              >
                g
              </span>
            </div>
            {lines.fields.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                aria-label="Remover rolo"
                icon={<Trash2 className="size-4" />}
                onClick={() => lines.remove(index)}
              />
            )}
          </div>
        ))}
        {lines.fields.length < 8 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => lines.append({ rollId: '', grams: '' })}
          >
            Outro rolo
          </Button>
        )}
      </fieldset>

      {mode === 'FAILED' && (
        <>
          <Field label="O que aconteceu" htmlFor="fj-fnotes">
            <Input
              id="fj-fnotes"
              placeholder="Ex.: soltou da mesa na camada 12"
              {...register('failureNotes')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Tempo perdido (min)"
              htmlFor="fj-lost"
              hint={`Vazio = duração da impressão (${elapsedMinutes} min)`}
            >
              <Input id="fj-lost" inputMode="numeric" {...register('lostMinutes')} />
            </Field>
            <div className="pt-6">
              <Checkbox
                id="fj-reprint"
                label="Refazer estas peças"
                description="A ordem volta para a fila. Sem marcar, as peças são dispensadas."
                {...register('needsReprint')}
              />
            </div>
          </div>
        </>
      )}

      <Field label="Observações" htmlFor="fj-notes">
        <Textarea id="fj-notes" rows={2} {...register('notes')} />
      </Field>

      {needsNegative && can('inventory:allow-negative') && (
        <Checkbox
          id="fj-negative"
          label="Autorizar saldo negativo do rolo"
          description="Exceção administrativa. Fica registrada na auditoria com o seu usuário."
          {...register('allowNegative')}
        />
      )}

      <FormFooter
        onCancel={onDone}
        submitLabel={mode === 'SUCCESS' ? 'Concluir impressão' : 'Registrar falha'}
        loading={mutation.isPending}
      />
    </form>
  );
}
