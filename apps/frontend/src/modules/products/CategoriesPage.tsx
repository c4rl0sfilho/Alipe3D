import { categoryInputSchema, type CategoryInput, type CategorySummary } from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { toApiRequestError } from '@/services/api';
import { applyServerErrors } from '@/utils/form';
import { catalogKeys, categoriesApi } from './catalog.api';

export function CategoriesPage() {
  const { can } = useAuth();
  const canEdit = can('products:manage');
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: categoriesApi.list });
  const [form, setForm] = useState<{ open: boolean; category: CategorySummary | null }>({
    open: false,
    category: null,
  });
  const [deleting, setDeleting] = useState<CategorySummary | null>(null);

  const remove = useMutation({
    mutationFn: (c: CategorySummary) => categoriesApi.remove(c.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
      toast.success('Categoria excluída.');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(null);
    },
  });

  const columns: Column<CategorySummary>[] = [
    {
      key: 'name',
      header: 'Categoria',
      cell: (c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          {c.description && <p className="text-xs text-ink-muted">{c.description}</p>}
        </div>
      ),
    },
    { key: 'count', header: 'Produtos', cell: (c) => c.productCount },
  ];
  if (canEdit) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar ${c.name}`}
            onClick={() => setForm({ open: true, category: c })}
            icon={<Pencil className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Excluir ${c.name}`}
            onClick={() => setDeleting(c)}
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
      <PageHeader
        title="Categorias de produtos"
        description="Organize o catálogo (ex.: Suportes, Decoração, Organizadores)."
        actions={
          canEdit && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setForm({ open: true, category: null })}
            >
              Nova categoria
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={categories.data}
          rowKey={(c) => c.id}
          loading={categories.isFetching}
          empty={<EmptyState icon={Tags} title="Nenhuma categoria cadastrada" />}
        />
      </Card>

      <Modal
        open={form.open}
        onClose={() => setForm({ open: false, category: null })}
        title={form.category ? 'Editar categoria' : 'Nova categoria'}
        size="sm"
      >
        <CategoryForm
          key={form.category?.id ?? 'new'}
          category={form.category}
          onDone={() => setForm({ open: false, category: null })}
        />
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Excluir categoria"
        message={
          <>
            A categoria <strong className="text-ink">{deleting?.name}</strong> será excluída. Só é
            possível se não houver produtos nela.
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

function CategoryForm({
  category,
  onDone,
}: {
  category: CategorySummary | null;
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
  } = useForm<CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: { name: category?.name ?? '', description: category?.description ?? '' },
  });
  const mutation = useMutation({
    mutationFn: (values: CategoryInput) =>
      category ? categoriesApi.update(category.id, values) : categoriesApi.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
      toast.success(category ? 'Categoria atualizada.' : 'Categoria criada.');
      onDone();
    },
    onError: (error) => setFormError(applyServerErrors(error, setError, ['name', 'description'])),
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
      <Field label="Nome" htmlFor="c-name" error={errors.name?.message} required>
        <Input id="c-name" autoFocus invalid={!!errors.name} {...register('name')} />
      </Field>
      <Field label="Descrição" htmlFor="c-description" error={errors.description?.message}>
        <Input id="c-description" {...register('description')} />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={category ? 'Salvar' : 'Criar categoria'}
        loading={mutation.isPending}
      />
    </form>
  );
}
