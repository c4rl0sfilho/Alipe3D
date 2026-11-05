import type { VariantDetail } from '@alipe3d/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CountBadge, Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { toApiRequestError } from '@/services/api';
import { formatCurrency, formatGrams, formatMinutes, formatNumber } from '@/utils/format';
import { BillOfMaterialsEditor } from './BillOfMaterialsEditor';
import { catalogKeys, productsApi } from './catalog.api';
import { ProductFilesPanel } from './ProductFilesPanel';
import { ProductFormModal } from './ProductFormModal';
import { ProductImage } from './ProductImage';
import { productStatusBadge } from './product-ui';
import { VariantFormModal } from './VariantFormModal';

type TabId = 'variants' | 'bom' | 'files';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canEdit = can('products:manage');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('variants');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [variantForm, setVariantForm] = useState<{ open: boolean; variant: VariantDetail | null }>({
    open: false,
    variant: null,
  });
  const [variantToDelete, setVariantToDelete] = useState<VariantDetail | null>(null);

  const product = useQuery({
    queryKey: catalogKeys.product(id),
    queryFn: () => productsApi.get(id),
  });

  const removeProduct = useMutation({
    mutationFn: () => productsApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto excluído.');
      navigate('/produtos', { replace: true });
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(false);
    },
  });
  const removeVariant = useMutation({
    mutationFn: (variant: VariantDetail) => productsApi.removeVariant(variant.id),
    onSuccess: (saved) => {
      queryClient.setQueryData(catalogKeys.product(id), saved);
      toast.success('Variação excluída.');
      setVariantToDelete(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setVariantToDelete(null);
    },
  });

  if (product.isPending) return <Card className="h-64 animate-pulse bg-canvas" />;
  if (product.error || !product.data) {
    return (
      <EmptyState
        icon={Layers}
        title="Produto não encontrado"
        description={product.error ? toApiRequestError(product.error).message : undefined}
        action={
          <Link to="/produtos">
            <Button variant="secondary">Voltar aos produtos</Button>
          </Link>
        }
      />
    );
  }
  const p = product.data;
  const cover = p.files.find((f) => f.isCover);

  const variantColumns: Column<VariantDetail>[] = [
    {
      key: 'variant',
      header: 'Variação',
      cell: (v) => (
        <div>
          <p className="font-medium">
            {v.label}
            {!v.isActive && <span className="ml-2 text-xs text-ink-muted">(inativa)</span>}
          </p>
          <p className="font-mono text-xs text-ink-muted">{v.sku}</p>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Preço',
      cell: (v) => (
        <Inherited own={v.overrides.salePrice !== null}>{formatCurrency(v.salePrice)}</Inherited>
      ),
    },
    {
      key: 'print',
      header: 'Peso · tempo',
      cell: (v) => (
        <span className="whitespace-nowrap">
          <Inherited own={v.overrides.estimatedWeightGrams !== null}>
            {formatGrams(v.estimatedWeightGrams)}
          </Inherited>
          {' · '}
          <Inherited own={v.overrides.estimatedPrintMinutes !== null}>
            {formatMinutes(v.estimatedPrintMinutes)}
          </Inherited>
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'stock',
      header: 'Estoque',
      cell: (v) => (
        <span
          className={
            Number(v.stockQuantity) < Number(v.minStock) ? 'font-medium text-warning' : undefined
          }
        >
          {formatNumber(v.stockQuantity, 3)}
          <span className="text-xs text-ink-muted"> / mín. {formatNumber(v.minStock, 3)}</span>
        </span>
      ),
    },
    {
      key: 'bom',
      header: 'Ficha',
      cell: (v) =>
        v.billOfMaterials.length ? (
          `${v.billOfMaterials.length} itens`
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      hideOnMobile: true,
    },
  ];
  if (canEdit) {
    variantColumns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (v) =>
        v.isDefault ? (
          <span className="text-xs text-ink-muted">Dados do produto</span>
        ) : (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Editar variação ${v.label}`}
              onClick={() => setVariantForm({ open: true, variant: v })}
              icon={<Pencil className="size-4" />}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Excluir variação ${v.label}`}
              onClick={() => setVariantToDelete(v)}
              icon={<Trash2 className="size-4 text-danger" />}
            />
          </div>
        ),
    });
  }

  return (
    <>
      <Link
        to="/produtos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Produtos
      </Link>

      <Card className="mb-6 flex flex-col gap-5 p-5 md:flex-row">
        <ProductImage
          productId={p.id}
          fileId={cover?.id ?? null}
          alt={p.name}
          className="size-28 shrink-0 rounded-lg border border-line"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
                <StatusBadge {...productStatusBadge(p.status)} />
              </div>
              <p className="mt-0.5 font-mono text-sm text-ink-muted">
                {p.sku}
                {p.category && <span className="font-sans"> · {p.category.name}</span>}
              </p>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil className="size-4" />}
                  onClick={() => setEditing(true)}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="size-4" />}
                  className="text-danger hover:text-danger"
                  onClick={() => setDeleting(true)}
                >
                  Excluir
                </Button>
              </div>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Info label="Preço de venda">{formatCurrency(p.salePrice)}</Info>
            <Info label="Peso estimado">{formatGrams(p.estimatedWeightGrams)}</Info>
            <Info label="Tempo de impressão">{formatMinutes(p.estimatedPrintMinutes)}</Info>
            <Info label="Estoque mínimo">{formatNumber(p.minStock, 3)} un</Info>
          </dl>
          {p.description && (
            <p className="mt-4 text-sm whitespace-pre-line text-ink-muted">{p.description}</p>
          )}
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'variants', label: 'Variações', badge: <CountBadge value={p.variants.length} /> },
          { id: 'bom', label: 'Ficha técnica' },
          { id: 'files', label: 'Arquivos', badge: <CountBadge value={p.files.length} /> },
        ]}
      />

      {tab === 'variants' && (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm text-ink-muted">Valores em cinza são herdados do produto.</p>
            {canEdit && (
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => setVariantForm({ open: true, variant: null })}
              >
                Nova variação
              </Button>
            )}
          </div>
          <DataTable columns={variantColumns} rows={p.variants} rowKey={(v) => v.id} empty={null} />
        </Card>
      )}
      {tab === 'bom' && <BillOfMaterialsEditor product={p} canEdit={canEdit} />}
      {tab === 'files' && <ProductFilesPanel product={p} canEdit={canEdit} />}

      <ProductFormModal open={editing} product={p} onClose={() => setEditing(false)} />
      <VariantFormModal
        open={variantForm.open}
        product={p}
        variant={variantForm.variant}
        onClose={() => setVariantForm({ open: false, variant: null })}
      />
      <ConfirmDialog
        open={deleting}
        title="Excluir produto"
        message={
          <>
            <strong className="text-ink">{p.name}</strong> sairá do catálogo. O histórico de estoque
            e os arquivos são preservados. Só é possível excluir com o estoque zerado.
          </>
        }
        confirmLabel="Excluir produto"
        loading={removeProduct.isPending}
        onConfirm={() => removeProduct.mutate()}
        onCancel={() => setDeleting(false)}
      />
      <ConfirmDialog
        open={!!variantToDelete}
        title="Excluir variação"
        message={
          <>
            A variação <strong className="text-ink">{variantToDelete?.label}</strong> será excluída.
            Só é possível com o estoque zerado.
          </>
        }
        confirmLabel="Excluir variação"
        loading={removeVariant.isPending}
        onConfirm={() => variantToDelete && removeVariant.mutate(variantToDelete)}
        onCancel={() => setVariantToDelete(null)}
      />
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

/** Valor herdado do produto aparece em cinza; valor próprio da variação, em destaque. */
function Inherited({ own, children }: { own: boolean; children: ReactNode }) {
  return <span className={own ? 'font-medium text-ink' : 'text-ink-muted'}>{children}</span>;
}
