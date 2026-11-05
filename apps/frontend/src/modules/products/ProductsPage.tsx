import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  type ListProductsQuery,
  type ProductListItem,
  type ProductStatus,
} from '@alipe3d/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Package, Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toApiRequestError } from '@/services/api';
import { formatCurrency, formatGrams, formatMinutes, formatNumber } from '@/utils/format';
import { catalogKeys, categoriesApi, productsApi } from './catalog.api';
import { ProductFormModal } from './ProductFormModal';
import { ProductImage } from './ProductImage';
import { productStatusBadge } from './product-ui';

export function ProductsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const query: ListProductsQuery = {
    search: debouncedSearch,
    categoryId,
    status,
    page,
    pageSize: 20,
  };
  const products = useQuery({
    queryKey: catalogKeys.products(query),
    queryFn: () => productsApi.list(query),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: categoriesApi.list });
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const columns: Column<ProductListItem>[] = [
    {
      key: 'product',
      header: 'Produto',
      cell: (p) => (
        <Link to={`/produtos/${p.id}`} className="flex items-center gap-3 hover:text-brand-700">
          <ProductImage
            productId={p.id}
            fileId={p.coverFileId}
            alt=""
            className="size-11 shrink-0 rounded-lg border border-line"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block font-mono text-xs text-ink-muted">{p.sku}</span>
          </span>
        </Link>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (p) => p.category?.name ?? <span className="text-ink-muted">—</span>,
      hideOnMobile: true,
    },
    {
      key: 'price',
      header: 'Preço',
      cell: (p) => formatCurrency(p.salePrice),
      className: 'whitespace-nowrap',
    },
    {
      key: 'print',
      header: 'Impressão',
      cell: (p) => (
        <span className="text-ink-muted">
          {formatGrams(p.estimatedWeightGrams)} · {formatMinutes(p.estimatedPrintMinutes)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'stock',
      header: 'Estoque',
      cell: (p) => (
        <span className="tabular-nums">
          {formatNumber(p.stockQuantity, 3)} un
          {p.variantCount > 1 && (
            <span className="block text-xs text-ink-muted">{p.variantCount} variações</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => <StatusBadge {...productStatusBadge(p.status)} />,
      hideOnMobile: true,
    },
  ];

  const hasFilters = !!search || !!categoryId || status !== 'all';

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo de produtos fabricados, com variações, ficha técnica e arquivos."
        actions={
          <>
            <Link to="/produtos/categorias">
              <Button variant="secondary" icon={<Tags className="size-4" />}>
                Categorias
              </Button>
            </Link>
            {can('products:manage') && (
              <Button icon={<Plus className="size-4" />} onClick={() => setFormOpen(true)}>
                Novo produto
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row">
          <SearchInput
            value={search}
            onChange={(v) => filter(() => setSearch(v))}
            placeholder="Buscar por nome ou SKU"
          />
          <Select
            aria-label="Filtrar por categoria"
            value={categoryId}
            onChange={(e) => filter(() => setCategoryId(e.target.value))}
            className="md:w-52"
          >
            <option value="">Todas as categorias</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por status"
            value={status}
            onChange={(e) => filter(() => setStatus(e.target.value as ProductStatus | 'all'))}
            className="md:w-48"
          >
            <option value="all">Todos os status</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRODUCT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {products.error ? (
          <EmptyState
            icon={Package}
            title="Não foi possível carregar os produtos"
            description={toApiRequestError(products.error).message}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={products.data?.items}
            rowKey={(p) => p.id}
            loading={products.isFetching}
            empty={
              <EmptyState
                icon={Package}
                title={hasFilters ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                description={
                  hasFilters
                    ? 'Ajuste a busca ou os filtros.'
                    : 'Cadastre o primeiro produto para começar.'
                }
                action={
                  !hasFilters && can('products:manage') ? (
                    <Button icon={<Plus className="size-4" />} onClick={() => setFormOpen(true)}>
                      Novo produto
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
        {products.data && (
          <Pagination
            page={products.data.meta.page}
            totalPages={products.data.meta.totalPages}
            totalItems={products.data.meta.totalItems}
            pageSize={products.data.meta.pageSize}
            onPageChange={setPage}
          />
        )}
      </Card>

      <ProductFormModal
        open={formOpen}
        product={null}
        onClose={() => setFormOpen(false)}
        onSaved={(product) => navigate(`/produtos/${product.id}`)}
      />
    </>
  );
}
