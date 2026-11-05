import {
  STOCK_UNIT_LABELS,
  STOCK_UNITS,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_LABELS,
  supplyInputSchema,
  type ListStockItemsQuery,
  type StockItemSummary,
  type SupplyCategory,
  type SupplyInput,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toApiRequestError } from '@/services/api';
import { applyServerErrors } from '@/utils/form';
import { formatUnitCost } from '@/utils/format';
import { toInput } from '../products/product-ui';
import { inventoryKeys, stockApi, suppliersApi } from './inventory.api';
import { formatStock, useInvalidateStock } from './inventory-ui';
import { MovementModal, type MovementTarget } from './MovementModal';

/** Lista de insumos ou de produtos acabados (mesma estrutura, regras diferentes). */
export function StockItemsPage({ kind }: { kind: 'SUPPLY' | 'FINISHED_GOOD' }) {
  const { can } = useAuth();
  const canEdit = can('inventory:manage');
  const isSupply = kind === 'SUPPLY';
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SupplyCategory | ''>('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const [moving, setMoving] = useState<MovementTarget | null>(null);
  const [form, setForm] = useState<{ open: boolean; item: StockItemSummary | null }>({
    open: false,
    item: null,
  });
  const [deleting, setDeleting] = useState<StockItemSummary | null>(null);

  const query: ListStockItemsQuery = {
    kind,
    search: debounced,
    category,
    lowOnly: lowOnly ? 'true' : 'false',
    page,
    pageSize: 20,
  };
  const items = useQuery({
    queryKey: inventoryKeys.items(query),
    queryFn: () => stockApi.listItems(query),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (item: StockItemSummary) => stockApi.removeSupply(item.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Insumo excluído.');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(null);
    },
  });

  const columns: Column<StockItemSummary>[] = [
    {
      key: 'name',
      header: isSupply ? 'Insumo' : 'Produto',
      cell: (i) =>
        isSupply ? (
          <div>
            <p className="font-medium">{i.name}</p>
            <p className="text-xs text-ink-muted">
              {i.category ? SUPPLY_CATEGORY_LABELS[i.category] : ''}
              {i.sku && ` · ${i.sku}`}
            </p>
          </div>
        ) : (
          <Link to={`/produtos/${i.variant?.productId ?? ''}`} className="hover:text-brand-700">
            <p className="font-medium">{i.variant?.productName}</p>
            <p className="text-xs text-ink-muted">
              {i.variant?.label} · <span className="font-mono">{i.sku}</span>
            </p>
          </Link>
        ),
    },
    {
      key: 'qty',
      header: 'Saldo',
      cell: (i) => (
        <span
          className={
            Number(i.quantity) < 0 ? 'font-medium text-danger' : 'font-medium tabular-nums'
          }
        >
          {formatStock(i.quantity, i.unit)}
        </span>
      ),
    },
    {
      key: 'min',
      header: 'Mínimo',
      cell: (i) =>
        Number(i.minQuantity) > 0 ? (
          formatStock(i.minQuantity, i.unit)
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      hideOnMobile: true,
    },
    ...(isSupply
      ? [
          {
            key: 'cost',
            header: 'Custo médio',
            cell: (i: StockItemSummary) =>
              i.averageUnitCost ? (
                formatUnitCost(i.averageUnitCost)
              ) : (
                <span className="text-ink-muted">—</span>
              ),
            hideOnMobile: true,
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Situação',
      cell: (i) =>
        i.isBelowMinimum ? (
          <StatusBadge tone="warning" label="Repor" />
        ) : (
          <StatusBadge tone="success" label="OK" />
        ),
      hideOnMobile: true,
    },
  ];
  if (canEdit) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            title="Registrar movimentação"
            aria-label={`Movimentar ${i.name}`}
            onClick={() =>
              setMoving({ kind, id: i.id, label: i.name, unit: i.unit, balance: i.quantity })
            }
            icon={<ArrowLeftRight className="size-4" />}
          />
          {isSupply && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar ${i.name}`}
                onClick={() => setForm({ open: true, item: i })}
                icon={<Pencil className="size-4" />}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Excluir ${i.name}`}
                onClick={() => setDeleting(i)}
                icon={<Trash2 className="size-4 text-danger" />}
              />
            </>
          )}
        </div>
      ),
    });
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={
              isSupply ? 'Buscar insumo por nome ou código' : 'Buscar produto por nome ou SKU'
            }
          />
          {isSupply && (
            <Select
              aria-label="Filtrar por categoria"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as SupplyCategory | '');
                setPage(1);
              }}
              className="lg:w-52"
            >
              <option value="">Todas as categorias</option>
              {SUPPLY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SUPPLY_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
          <Checkbox
            id={`low-${kind}`}
            label="Só abaixo do mínimo"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          {isSupply && canEdit && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setForm({ open: true, item: null })}
              className="lg:ml-auto"
            >
              Novo insumo
            </Button>
          )}
        </div>
        {!isSupply && (
          <p className="border-b border-line bg-canvas/60 px-4 py-2.5 text-xs text-ink-muted">
            Cada variação de produto tem seu saldo. Entradas de produção serão automáticas a partir
            da Fase 4; até lá, use ajuste manual (ex.: contagem inicial).
          </p>
        )}
        <DataTable
          columns={columns}
          rows={items.data?.items}
          rowKey={(i) => i.id}
          loading={items.isFetching}
          empty={
            isSupply ? (
              <EmptyState
                icon={Boxes}
                title="Nenhum insumo encontrado"
                description="Cadastre embalagens, etiquetas, bicos e outros consumíveis."
              />
            ) : (
              <EmptyState
                icon={Package}
                title="Nenhum produto acabado"
                description="Os itens aparecem aqui automaticamente quando produtos são cadastrados."
              />
            )
          }
        />
        {items.data && (
          <Pagination
            page={items.data.meta.page}
            totalPages={items.data.meta.totalPages}
            totalItems={items.data.meta.totalItems}
            pageSize={items.data.meta.pageSize}
            onPageChange={setPage}
          />
        )}
      </Card>

      <MovementModal target={moving} onClose={() => setMoving(null)} />
      {isSupply && (
        <>
          <Modal
            open={form.open}
            onClose={() => setForm({ open: false, item: null })}
            title={form.item ? 'Editar insumo' : 'Novo insumo'}
          >
            <SupplyForm
              key={form.item?.id ?? 'new'}
              item={form.item}
              onDone={() => setForm({ open: false, item: null })}
            />
          </Modal>
          <ConfirmDialog
            open={!!deleting}
            title="Excluir insumo"
            message={
              <>
                O insumo <strong className="text-ink">{deleting?.name}</strong> será excluído. Só é
                possível com saldo zerado e fora das fichas técnicas.
              </>
            }
            confirmLabel="Excluir"
            loading={remove.isPending}
            onConfirm={() => deleting && remove.mutate(deleting)}
            onCancel={() => setDeleting(null)}
          />
        </>
      )}
    </>
  );
}

const FIELDS = ['name', 'sku', 'category', 'unit', 'minQuantity', 'supplierId', 'notes'] as const;

function SupplyForm({ item, onDone }: { item: StockItemSummary | null; onDone: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const [formError, setFormError] = useState<string | null>(null);
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: suppliersApi.list });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SupplyInput>({
    resolver: zodResolver(supplyInputSchema),
    defaultValues: {
      name: item?.name ?? '',
      sku: item?.sku ?? '',
      category: item?.category ?? 'PACKAGING',
      unit: item?.unit ?? 'UN',
      minQuantity: toInput(item?.minQuantity ?? 0),
      supplierId: item?.supplier?.id ?? '',
      notes: item?.notes ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: (v: SupplyInput) =>
      item ? stockApi.updateSupply(item.id, v) : stockApi.createSupply(v),
    onSuccess: async () => {
      await invalidate();
      toast.success(
        item
          ? 'Insumo atualizado.'
          : 'Insumo cadastrado. Registre a entrada por compra para lançar o saldo.',
      );
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
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Nome" htmlFor="s-name" error={errors.name?.message} required>
          <Input
            id="s-name"
            autoFocus
            placeholder="Caixa kraft 15x15x10"
            invalid={!!errors.name}
            {...register('name')}
          />
        </Field>
        <Field label="Código" htmlFor="s-sku" error={errors.sku?.message}>
          <Input id="s-sku" className="uppercase" {...register('sku')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Categoria" htmlFor="s-category" required>
          <Select id="s-category" {...register('category')}>
            {SUPPLY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPLY_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Unidade"
          htmlFor="s-unit"
          required
          hint={item ? 'Só muda com saldo zerado' : undefined}
        >
          <Select id="s-unit" {...register('unit')}>
            {STOCK_UNITS.map((u) => (
              <option key={u} value={u}>
                {STOCK_UNIT_LABELS[u]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estoque mínimo" htmlFor="s-min" error={errors.minQuantity?.message}>
          <Input id="s-min" inputMode="decimal" {...register('minQuantity')} />
        </Field>
      </div>
      <Field label="Fornecedor" htmlFor="s-supplier">
        <Select id="s-supplier" {...register('supplierId')}>
          <option value="">Não informado</option>
          {suppliers.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Observações" htmlFor="s-notes">
        <Textarea id="s-notes" rows={2} {...register('notes')} />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={item ? 'Salvar' : 'Cadastrar insumo'}
        loading={mutation.isPending}
      />
    </form>
  );
}
