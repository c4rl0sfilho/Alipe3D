import {
  MATERIAL_TYPE_LABELS,
  MATERIAL_TYPES,
  materialInputSchema,
  type MaterialInput,
  type MaterialSummary,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Cylinder, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { toApiRequestError } from '@/services/api';
import { applyServerErrors } from '@/utils/form';
import { formatGrams, formatUnitCost } from '@/utils/format';
import { toInput } from '../products/product-ui';
import { inventoryKeys, materialsApi } from './inventory.api';
import { useInvalidateStock } from './inventory-ui';
import { RollFormModal } from './RollFormModal';

export function MaterialsPage() {
  const { can } = useAuth();
  const canEdit = can('inventory:manage');
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });
  const [form, setForm] = useState<{ open: boolean; material: MaterialSummary | null }>({
    open: false,
    material: null,
  });
  const [rollFor, setRollFor] = useState<MaterialSummary | null>(null);
  const [deleting, setDeleting] = useState<MaterialSummary | null>(null);

  const remove = useMutation({
    mutationFn: (m: MaterialSummary) => materialsApi.remove(m.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Filamento excluído.');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(null);
    },
  });

  const columns: Column<MaterialSummary>[] = [
    {
      key: 'name',
      header: 'Filamento',
      cell: (m) => (
        <div className="flex items-center gap-3">
          <ColorSwatch hex={m.colorHex} className="size-5" />
          <div>
            <p className="font-medium">{m.name}</p>
            <p className="text-xs text-ink-muted">
              {MATERIAL_TYPE_LABELS[m.type]} · {m.color} · {m.manufacturer}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'available',
      header: 'Disponível',
      cell: (m) => (
        <div>
          <p className="font-medium tabular-nums">{formatGrams(m.availableGrams)}</p>
          <Link
            to={`/estoque/rolos?material=${m.id}`}
            className="text-xs text-brand-700 hover:underline"
          >
            {m.activeRolls} {m.activeRolls === 1 ? 'rolo' : 'rolos'}
          </Link>
        </div>
      ),
    },
    {
      key: 'min',
      header: 'Mínimo',
      cell: (m) =>
        Number(m.minStockGrams) > 0 ? (
          formatGrams(m.minStockGrams)
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      hideOnMobile: true,
    },
    {
      key: 'cost',
      header: 'Custo médio',
      cell: (m) =>
        m.averageCostPerGram ? (
          `${formatUnitCost(m.averageCostPerGram)}/g`
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Situação',
      cell: (m) =>
        m.isBelowMinimum ? (
          <StatusBadge
            tone={Number(m.availableGrams) <= 0 ? 'danger' : 'warning'}
            label={Number(m.availableGrams) <= 0 ? 'Sem estoque' : 'Repor'}
          />
        ) : (
          <StatusBadge tone="success" label="OK" />
        ),
    },
  ];
  if (canEdit) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (m) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => setRollFor(m)}
          >
            Rolo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar ${m.name}`}
            onClick={() => setForm({ open: true, material: m })}
            icon={<Pencil className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Excluir ${m.name}`}
            onClick={() => setDeleting(m)}
            icon={<Trash2 className="size-4 text-danger" />}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <p className="text-sm text-ink-muted">
            Cada filamento é um tipo + fabricante + cor. O saldo vem da soma dos rolos.
          </p>
          {canEdit && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setForm({ open: true, material: null })}
            >
              Novo filamento
            </Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={materials.data}
          rowKey={(m) => m.id}
          loading={materials.isFetching}
          empty={
            <EmptyState
              icon={Cylinder}
              title="Nenhum filamento cadastrado"
              description="Cadastre os filamentos que você usa (ex.: PLA Preto Bambu Lab) e depois registre os rolos."
            />
          }
        />
      </Card>

      <Modal
        open={form.open}
        onClose={() => setForm({ open: false, material: null })}
        title={form.material ? 'Editar filamento' : 'Novo filamento'}
      >
        <MaterialForm
          key={form.material?.id ?? 'new'}
          material={form.material}
          onDone={() => setForm({ open: false, material: null })}
        />
      </Modal>
      <RollFormModal open={!!rollFor} materialId={rollFor?.id} onClose={() => setRollFor(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Excluir filamento"
        message={
          <>
            O filamento <strong className="text-ink">{deleting?.name}</strong> será excluído. Só é
            possível sem rolos com saldo e fora das fichas técnicas.
          </>
        }
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

const FIELDS = [
  'name',
  'manufacturer',
  'type',
  'color',
  'colorHex',
  'minStockGrams',
  'notes',
] as const;

function MaterialForm({
  material,
  onDone,
}: {
  material: MaterialSummary | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MaterialInput>({
    resolver: zodResolver(materialInputSchema),
    defaultValues: {
      name: material?.name ?? '',
      manufacturer: material?.manufacturer ?? 'Bambu Lab',
      type: material?.type ?? 'PLA',
      color: material?.color ?? '',
      colorHex: material?.colorHex ?? '#29252a',
      minStockGrams: toInput(material?.minStockGrams ?? 1000),
      notes: material?.notes ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: (v: MaterialInput) =>
      material ? materialsApi.update(material.id, v) : materialsApi.create(v),
    onSuccess: async () => {
      await invalidate();
      toast.success(material ? 'Filamento atualizado.' : 'Filamento cadastrado.');
      onDone();
    },
    onError: (error) => setFormError(applyServerErrors(error, setError, FIELDS)),
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
      <Field label="Nome" htmlFor="mt-name" error={errors.name?.message} required>
        <Input
          id="mt-name"
          autoFocus
          placeholder="PLA Basic Preto"
          invalid={!!errors.name}
          {...register('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fabricante"
          htmlFor="mt-manufacturer"
          error={errors.manufacturer?.message}
          required
        >
          <Input
            id="mt-manufacturer"
            invalid={!!errors.manufacturer}
            {...register('manufacturer')}
          />
        </Field>
        <Field label="Tipo" htmlFor="mt-type" error={errors.type?.message} required>
          <Select id="mt-type" {...register('type')}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {MATERIAL_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_1fr]">
        <Field label="Cor" htmlFor="mt-color" error={errors.color?.message} required>
          <Input
            id="mt-color"
            placeholder="Preto"
            invalid={!!errors.color}
            {...register('color')}
          />
        </Field>
        <Field label="Amostra" htmlFor="mt-hex">
          <Input id="mt-hex" type="color" className="p-1" {...register('colorHex')} />
        </Field>
        <Field
          label="Estoque mínimo (g)"
          htmlFor="mt-min"
          error={errors.minStockGrams?.message}
          hint="Abaixo disso, gera alerta de reposição"
        >
          <Input
            id="mt-min"
            inputMode="decimal"
            invalid={!!errors.minStockGrams}
            {...register('minStockGrams')}
          />
        </Field>
      </div>
      <Field label="Observações" htmlFor="mt-notes">
        <Textarea
          id="mt-notes"
          rows={2}
          placeholder="Temperatura, secagem, perfil recomendado..."
          {...register('notes')}
        />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={material ? 'Salvar' : 'Cadastrar filamento'}
        loading={mutation.isPending}
      />
    </form>
  );
}
