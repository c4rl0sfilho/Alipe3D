import {
  MATERIAL_TYPE_LABELS,
  STOCK_UNIT_LABELS,
  type ProductDetail,
  type VariantDetail,
} from '@alipe3d/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { toApiRequestError } from '@/services/api';
import { formatGrams } from '@/utils/format';
import { inventoryKeys, materialsApi, stockApi } from '../inventory/inventory.api';
import { catalogKeys, productsApi } from './catalog.api';
import { toInput } from './product-ui';

interface Line {
  component: string; // "m:<id>" (filamento) ou "s:<id>" (insumo)
  quantity: string;
  notes: string;
}

function linesOf(variant: VariantDetail): Line[] {
  return variant.billOfMaterials.map((line) => ({
    component: line.material ? `m:${line.material.id}` : `s:${line.supply?.id ?? ''}`,
    quantity: toInput(line.quantity),
    notes: line.notes ?? '',
  }));
}

export function BillOfMaterialsEditor({
  product,
  canEdit,
}: {
  product: ProductDetail;
  canEdit: boolean;
}) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  if (!variant) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        O que é consumido para fabricar <strong className="text-ink">uma unidade</strong>. Será
        usado na baixa automática de materiais (Fase 4) e no cálculo de custo (Fase 6).
      </p>
      {product.variants.length > 1 && (
        <Select
          aria-label="Variação"
          value={variant.id}
          onChange={(e) => setVariantId(e.target.value)}
          className="sm:w-80"
        >
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} ({v.sku})
            </option>
          ))}
        </Select>
      )}
      <VariantBom
        key={variant.id + variant.billOfMaterials.map((l) => l.id).join()}
        variant={variant}
        canEdit={canEdit}
      />
    </div>
  );
}

function VariantBom({ variant, canEdit }: { variant: VariantDetail; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });
  const supplies = useQuery({
    queryKey: inventoryKeys.items({ kind: 'SUPPLY', pageSize: 100 }),
    queryFn: () => stockApi.listItems({ kind: 'SUPPLY', pageSize: 100 }),
  });

  const { control, register, handleSubmit, reset, formState } = useForm<{ lines: Line[] }>({
    defaultValues: { lines: linesOf(variant) },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });

  const mutation = useMutation({
    mutationFn: (values: { lines: Line[] }) =>
      productsApi.setBillOfMaterials(variant.id, {
        items: values.lines.map((line) => ({
          materialId: line.component.startsWith('m:') ? line.component.slice(2) : null,
          supplyItemId: line.component.startsWith('s:') ? line.component.slice(2) : null,
          quantity: line.quantity,
          notes: line.notes,
        })),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(catalogKeys.product(saved.id), saved);
      const updated = saved.variants.find((v) => v.id === variant.id);
      if (updated) reset({ lines: linesOf(updated) });
      toast.success('Ficha técnica salva.');
    },
    onError: (error) => setFormError(toApiRequestError(error).message),
  });

  const totalGrams = lines
    .filter((l) => l.component.startsWith('m:'))
    .reduce((sum, l) => sum + (Number(l.quantity.replace(',', '.')) || 0), 0);
  const estimated = Number(variant.estimatedWeightGrams);
  const divergent =
    totalGrams > 0 && estimated > 0 && Math.abs(totalGrams - estimated) / estimated > 0.1;
  const unitOf = (component: string) => {
    if (component.startsWith('m:')) return 'g';
    const supply = supplies.data?.items.find((s) => s.id === component.slice(2));
    return supply ? STOCK_UNIT_LABELS[supply.unit] : 'un';
  };

  if (!canEdit && fields.length === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="Ficha técnica não cadastrada" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <form
        noValidate
        onSubmit={handleSubmit((values) => {
          setFormError(null);
          mutation.mutate(values);
        })}
        className="space-y-3"
      >
        {formError && <Alert tone="error">{formError}</Alert>}

        {fields.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-muted">
            Nenhum material na ficha desta variação.
          </p>
        )}

        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[2fr_8rem_1.5fr_auto] sm:items-center sm:border-0 sm:p-0"
          >
            <Select
              aria-label="Material"
              disabled={!canEdit}
              {...register(`lines.${index}.component`, { required: true })}
            >
              <option value="">Escolha um filamento ou insumo</option>
              <optgroup label="Filamentos">
                {materials.data?.map((m) => (
                  <option key={m.id} value={`m:${m.id}`}>
                    {m.name} — {MATERIAL_TYPE_LABELS[m.type]} {m.color} ({m.manufacturer})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Insumos">
                {supplies.data?.items.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </Select>
            <div className="relative">
              <Input
                aria-label="Quantidade"
                inputMode="decimal"
                disabled={!canEdit}
                className="pr-14"
                {...register(`lines.${index}.quantity`, { required: true })}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-muted">
                {unitOf(lines[index]?.component ?? '')}
              </span>
            </div>
            <Input
              aria-label="Observação"
              placeholder="Observação (opcional)"
              disabled={!canEdit}
              {...register(`lines.${index}.notes`)}
            />
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remover linha"
                onClick={() => remove(index)}
                icon={<Trash2 className="size-4" />}
              />
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <div className="flex items-center gap-2 text-ink-muted">
            Filamento total: <strong className="text-ink">{formatGrams(totalGrams)}</strong>
            <span>· peso estimado {formatGrams(estimated)}</span>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => append({ component: '', quantity: '', notes: '' })}
              >
                Adicionar
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={mutation.isPending}
                disabled={!formState.isDirty}
              >
                Salvar ficha
              </Button>
            </div>
          )}
        </div>
        {divergent && (
          <Alert tone="info">
            O total de filamento difere mais de 10% do peso estimado. Confira se a ficha inclui
            suportes e purga.
          </Alert>
        )}
      </form>
    </Card>
  );
}
