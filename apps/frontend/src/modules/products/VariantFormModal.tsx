import {
  variantInputSchema,
  type ProductDetail,
  type VariantDetail,
  type VariantInput,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, Input } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { applyServerErrors } from '@/utils/form';
import { formatCurrency, formatGrams, formatMinutes, formatNumber } from '@/utils/format';
import { catalogKeys, productsApi } from './catalog.api';
import { toInput } from './product-ui';

interface VariantFormModalProps {
  open: boolean;
  product: ProductDetail;
  variant: VariantDetail | null;
  onClose: () => void;
}

export function VariantFormModal({ open, product, variant, onClose }: VariantFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={variant ? `Editar variação ${variant.label}` : 'Nova variação'}
      description="Informe ao menos um atributo. Campos de valor vazios usam o valor do produto."
    >
      <VariantForm
        key={variant?.id ?? 'new'}
        product={product}
        variant={variant}
        onDone={onClose}
      />
    </Modal>
  );
}

const FIELDS = [
  'sku',
  'color',
  'material',
  'size',
  'model',
  'salePrice',
  'estimatedWeightGrams',
  'estimatedPrintMinutes',
  'minStock',
] as const;

function VariantForm({
  product,
  variant,
  onDone,
}: {
  product: ProductDetail;
  variant: VariantDetail | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VariantInput>({
    resolver: zodResolver(variantInputSchema),
    defaultValues: {
      sku: variant?.sku ?? `${product.sku}-`,
      color: variant?.color ?? '',
      material: variant?.material ?? '',
      size: variant?.size ?? '',
      model: variant?.model ?? '',
      salePrice: toInput(variant?.overrides.salePrice),
      estimatedWeightGrams: toInput(variant?.overrides.estimatedWeightGrams),
      estimatedPrintMinutes: variant?.overrides.estimatedPrintMinutes ?? '',
      minStock: toInput(variant?.overrides.minStock),
      isActive: variant?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: VariantInput) =>
      variant
        ? productsApi.updateVariant(variant.id, values)
        : productsApi.createVariant(product.id, values),
    onSuccess: async (saved) => {
      queryClient.setQueryData(catalogKeys.product(saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(variant ? 'Variação atualizada.' : 'Variação criada.');
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

      <Field label="SKU da variação" htmlFor="v-sku" error={errors.sku?.message} required>
        <Input
          id="v-sku"
          autoFocus
          className="uppercase"
          invalid={!!errors.sku}
          {...register('sku')}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Atributos</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Cor" htmlFor="v-color" error={errors.color?.message}>
            <Input id="v-color" placeholder="Preto" {...register('color')} />
          </Field>
          <Field label="Material" htmlFor="v-material" error={errors.material?.message}>
            <Input id="v-material" placeholder="PLA" {...register('material')} />
          </Field>
          <Field label="Tamanho" htmlFor="v-size" error={errors.size?.message}>
            <Input id="v-size" placeholder="M" {...register('size')} />
          </Field>
          <Field label="Modelo" htmlFor="v-model" error={errors.model?.message}>
            <Input id="v-model" {...register('model')} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Valores próprios (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field
            label="Preço (R$)"
            htmlFor="v-price"
            error={errors.salePrice?.message}
            hint={`Produto: ${formatCurrency(product.salePrice)}`}
          >
            <Input id="v-price" inputMode="decimal" {...register('salePrice')} />
          </Field>
          <Field
            label="Peso (g)"
            htmlFor="v-weight"
            error={errors.estimatedWeightGrams?.message}
            hint={`Produto: ${formatGrams(product.estimatedWeightGrams)}`}
          >
            <Input id="v-weight" inputMode="decimal" {...register('estimatedWeightGrams')} />
          </Field>
          <Field
            label="Tempo (min)"
            htmlFor="v-time"
            error={errors.estimatedPrintMinutes?.message}
            hint={`Produto: ${formatMinutes(product.estimatedPrintMinutes)}`}
          >
            <Input id="v-time" inputMode="numeric" {...register('estimatedPrintMinutes')} />
          </Field>
          <Field
            label="Estoque mín."
            htmlFor="v-min"
            error={errors.minStock?.message}
            hint={`Produto: ${formatNumber(product.minStock, 3)}`}
          >
            <Input id="v-min" inputMode="decimal" {...register('minStock')} />
          </Field>
        </div>
      </fieldset>

      <Checkbox
        id="v-active"
        label="Variação ativa (disponível para venda e produção)"
        {...register('isActive')}
      />

      <FormFooter
        onCancel={onDone}
        submitLabel={variant ? 'Salvar alterações' : 'Criar variação'}
        loading={mutation.isPending}
      />
    </form>
  );
}
