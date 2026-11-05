import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  productInputSchema,
  type ProductDetail,
  type ProductInput,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { applyServerErrors } from '@/utils/form';
import { catalogKeys, categoriesApi, productsApi } from './catalog.api';
import { toInput } from './product-ui';

interface ProductFormModalProps {
  open: boolean;
  product: ProductDetail | null;
  onClose: () => void;
  onSaved?: (product: ProductDetail) => void;
}

export function ProductFormModal({ open, product, onClose, onSaved }: ProductFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? 'Editar produto' : 'Novo produto'}
      description="Os valores abaixo valem para todas as variações que não tiverem valores próprios."
    >
      <ProductForm
        key={product?.id ?? 'new'}
        product={product}
        onDone={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

const FIELDS = [
  'sku',
  'name',
  'description',
  'categoryId',
  'status',
  'salePrice',
  'estimatedWeightGrams',
  'estimatedPrintMinutes',
  'minStock',
] as const;

function ProductForm({
  product,
  onDone,
  onSaved,
}: {
  product: ProductDetail | null;
  onDone: () => void;
  onSaved: ((product: ProductDetail) => void) | undefined;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: categoriesApi.list });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      description: product?.description ?? '',
      categoryId: product?.category?.id ?? '',
      status: product?.status ?? 'DRAFT',
      salePrice: toInput(product?.salePrice),
      estimatedWeightGrams: toInput(product?.estimatedWeightGrams),
      estimatedPrintMinutes: product?.estimatedPrintMinutes ?? '',
      minStock: toInput(product?.minStock ?? 0),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ProductInput) =>
      product ? productsApi.update(product.id, values) : productsApi.create(values),
    onSuccess: async (saved) => {
      queryClient.setQueryData(catalogKeys.product(saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
      toast.success(product ? 'Produto atualizado.' : 'Produto criado.');
      onDone();
      onSaved?.(saved);
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

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field
          label="SKU"
          htmlFor="p-sku"
          error={errors.sku?.message}
          required
          hint="Código interno único"
        >
          <Input
            id="p-sku"
            autoFocus
            className="uppercase"
            invalid={!!errors.sku}
            {...register('sku')}
          />
        </Field>
        <Field label="Nome" htmlFor="p-name" error={errors.name?.message} required>
          <Input id="p-name" invalid={!!errors.name} {...register('name')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="p-category" error={errors.categoryId?.message}>
          <Select id="p-category" {...register('categoryId')}>
            <option value="">Sem categoria</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="p-status" error={errors.status?.message}>
          <Select id="p-status" {...register('status')}>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRODUCT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field
          label="Preço de venda (R$)"
          htmlFor="p-price"
          error={errors.salePrice?.message}
          required
        >
          <Input
            id="p-price"
            inputMode="decimal"
            placeholder="0,00"
            invalid={!!errors.salePrice}
            {...register('salePrice')}
          />
        </Field>
        <Field
          label="Peso estimado (g)"
          htmlFor="p-weight"
          error={errors.estimatedWeightGrams?.message}
          required
        >
          <Input
            id="p-weight"
            inputMode="decimal"
            invalid={!!errors.estimatedWeightGrams}
            {...register('estimatedWeightGrams')}
          />
        </Field>
        <Field
          label="Tempo de impressão (min)"
          htmlFor="p-time"
          error={errors.estimatedPrintMinutes?.message}
          required
        >
          <Input
            id="p-time"
            inputMode="numeric"
            invalid={!!errors.estimatedPrintMinutes}
            {...register('estimatedPrintMinutes')}
          />
        </Field>
        <Field label="Estoque mínimo (un)" htmlFor="p-min" error={errors.minStock?.message}>
          <Input
            id="p-min"
            inputMode="decimal"
            invalid={!!errors.minStock}
            {...register('minStock')}
          />
        </Field>
      </div>

      <Field label="Descrição" htmlFor="p-description" error={errors.description?.message}>
        <Textarea id="p-description" rows={3} {...register('description')} />
      </Field>

      <FormFooter
        onCancel={onDone}
        submitLabel={product ? 'Salvar alterações' : 'Criar produto'}
        loading={mutation.isPending}
      />
    </form>
  );
}
