import {
  PRODUCTION_PRIORITIES,
  PRODUCTION_PRIORITY_LABELS,
  productionOrderInputSchema,
  type ProductionOrderDetail,
  type ProductionOrderInput,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { inventoryKeys, materialsApi } from '@/modules/inventory/inventory.api';
import { printerLabel } from '@/modules/printers/printer-ui';
import { printerKeys, printersApi } from '@/modules/printers/printers.api';
import { catalogKeys, productsApi } from '@/modules/products/catalog.api';
import { applyServerErrors } from '@/utils/form';
import { formatGrams, formatMinutes, todayIso } from '@/utils/format';
import { productionApi, productionKeys, useInvalidateProduction } from './production.api';

const FIELDS = [
  'variantId',
  'quantity',
  'materialId',
  'printerId',
  'priority',
  'dueDate',
  'responsibleId',
  'estimatedMinutes',
  'estimatedWeightGrams',
] as const;

interface Props {
  open: boolean;
  order: ProductionOrderDetail | null;
  onClose: () => void;
  onSaved?: (order: ProductionOrderDetail) => void;
}

export function ProductionOrderFormModal({ open, order, onClose, onSaved }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={order ? `Editar ${order.code}` : 'Nova ordem de produção'}
      description={
        order ? undefined : 'Sem impressora a ordem fica pendente; com impressora, planejada.'
      }
    >
      <OrderForm key={order?.id ?? 'new'} order={order} onDone={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function OrderForm({
  order,
  onDone,
  onSaved,
}: {
  order: ProductionOrderDetail | null;
  onDone: () => void;
  onSaved: Props['onSaved'];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProduction();
  const [formError, setFormError] = useState<string | null>(null);
  const [productId, setProductId] = useState(order?.product.id ?? '');

  const products = useQuery({
    queryKey: ['products', 'options'],
    queryFn: () => productsApi.list({ pageSize: 100, sort: 'name', order: 'asc' }),
  });
  const product = useQuery({
    queryKey: catalogKeys.product(productId),
    queryFn: () => productsApi.get(productId),
    enabled: !!productId,
  });
  const printers = useQuery({ queryKey: printerKeys.list, queryFn: printersApi.list });
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });
  const responsibles = useQuery({
    queryKey: productionKeys.responsibles,
    queryFn: productionApi.responsibles,
  });

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<ProductionOrderInput>({
    resolver: zodResolver(productionOrderInputSchema),
    defaultValues: {
      variantId: order?.variant.id ?? '',
      quantity: order?.quantity ?? 1,
      materialId: order?.material?.id ?? '',
      printerId: order?.printer?.id ?? '',
      priority: order?.priority ?? 'NORMAL',
      dueDate: order?.dueDate ?? '',
      responsibleId: order?.responsible.id ?? '',
      estimatedMinutes: order ? String(order.estimatedMinutes) : '',
      estimatedWeightGrams: order ? order.estimatedWeightGrams.replace('.', ',') : '',
      notes: order?.notes ?? '',
    },
  });
  const variantId = useWatch({ control, name: 'variantId' });
  const quantity = Number(useWatch({ control, name: 'quantity' })) || 0;
  const variant = product.data?.variants.find((v) => v.id === variantId);
  const mainFilament = variant?.billOfMaterials
    .filter((line) => line.material)
    .sort((a, b) => Number(b.quantity) - Number(a.quantity))[0]?.material;

  const mutation = useMutation({
    mutationFn: (values: ProductionOrderInput) =>
      order ? productionApi.updateOrder(order.id, values) : productionApi.createOrder(values),
    onSuccess: async (saved) => {
      queryClient.setQueryData(productionKeys.order(saved.id), saved);
      await invalidate();
      toast.success(order ? 'Ordem atualizada.' : `Ordem ${saved.code} criada.`);
      onDone();
      onSaved?.(saved);
    },
    onError: (error) => setFormError(applyServerErrors(error, setError, FIELDS)),
  });

  const selectableProducts = products.data?.items.filter(
    (p) => p.status !== 'INACTIVE' || p.id === order?.product.id,
  );

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
        <Field label="Produto" htmlFor="po-product" error={errors.variantId?.message} required>
          <Select
            id="po-product"
            value={productId}
            autoFocus
            invalid={!!errors.variantId}
            onChange={(e) => {
              setProductId(e.target.value);
              setValue('variantId', '');
            }}
          >
            <option value="">Escolha o produto</option>
            {selectableProducts?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Variação" htmlFor="po-variant" required>
          <Select
            id="po-variant"
            disabled={!product.data}
            {...register('variantId', {
              onChange: () => {
                // Novo produto/variação: estimativas voltam a ser calculadas
                setValue('estimatedMinutes', '');
                setValue('estimatedWeightGrams', '');
                setValue('materialId', '');
              },
            })}
          >
            <option value="">{product.isFetching ? 'Carregando...' : 'Escolha a variação'}</option>
            {product.data?.variants
              .filter((v) => v.isActive || v.id === order?.variant.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} · {v.sku}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quantidade" htmlFor="po-qty" error={errors.quantity?.message} required>
          <Input
            id="po-qty"
            type="number"
            min={1}
            invalid={!!errors.quantity}
            {...register('quantity')}
          />
        </Field>
        <Field label="Prioridade" htmlFor="po-priority">
          <Select id="po-priority" {...register('priority')}>
            {PRODUCTION_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRODUCTION_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prazo" htmlFor="po-due" error={errors.dueDate?.message}>
          <Input
            id="po-due"
            type="date"
            min={order ? undefined : todayIso()}
            {...register('dueDate')}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Impressora"
          htmlFor="po-printer"
          error={errors.printerId?.message}
          hint="Pode ser escolhida depois, ao iniciar a impressão"
        >
          <Select id="po-printer" {...register('printerId')}>
            <option value="">Sem impressora (pendente)</option>
            {printers.data
              ?.filter((p) => p.status !== 'INACTIVE' || p.id === order?.printer?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {printerLabel(p)}
                  {p.status === 'MAINTENANCE' ? ' (em manutenção)' : ''}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label="Filamento"
          htmlFor="po-material"
          error={errors.materialId?.message}
          hint={
            mainFilament
              ? `Vazio = ${mainFilament.name}, da ficha técnica`
              : 'Material e cor que serão usados'
          }
        >
          <Select id="po-material" {...register('materialId')}>
            <option value="">{mainFilament ? 'Usar o da ficha técnica' : 'Definir depois'}</option>
            {materials.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.color}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Tempo estimado (min)"
          htmlFor="po-minutes"
          error={errors.estimatedMinutes?.message}
          hint={
            variant
              ? `Vazio = ${formatMinutes(variant.estimatedPrintMinutes * quantity)}`
              : undefined
          }
        >
          <Input id="po-minutes" inputMode="numeric" {...register('estimatedMinutes')} />
        </Field>
        <Field
          label="Peso estimado (g)"
          htmlFor="po-grams"
          error={errors.estimatedWeightGrams?.message}
          hint={
            variant
              ? `Vazio = ${formatGrams(Number(variant.estimatedWeightGrams) * quantity)}`
              : undefined
          }
        >
          <Input id="po-grams" inputMode="decimal" {...register('estimatedWeightGrams')} />
        </Field>
        <Field label="Responsável" htmlFor="po-responsible">
          <Select id="po-responsible" {...register('responsibleId')}>
            <option value="">{order ? 'Manter' : 'Eu'}</option>
            {responsibles.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Observações" htmlFor="po-notes">
        <Textarea
          id="po-notes"
          rows={2}
          placeholder="Ex.: imprimir junto com a OP de cor igual"
          {...register('notes')}
        />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={order ? 'Salvar' : 'Criar ordem'}
        loading={mutation.isPending}
      />
    </form>
  );
}
