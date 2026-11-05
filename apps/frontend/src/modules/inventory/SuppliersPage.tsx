import { supplierInputSchema, type SupplierInput, type SupplierSummary } from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormFooter } from '@/components/ui/FormFooter';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { toApiRequestError } from '@/services/api';
import { applyServerErrors } from '@/utils/form';
import { inventoryKeys, suppliersApi } from './inventory.api';
import { useInvalidateStock } from './inventory-ui';

export function SuppliersPage() {
  const { can } = useAuth();
  const canEdit = can('inventory:manage');
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: suppliersApi.list });
  const [form, setForm] = useState<{ open: boolean; supplier: SupplierSummary | null }>({
    open: false,
    supplier: null,
  });
  const [deleting, setDeleting] = useState<SupplierSummary | null>(null);

  const remove = useMutation({
    mutationFn: (s: SupplierSummary) => suppliersApi.remove(s.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Fornecedor excluído.');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(null);
    },
  });

  const columns: Column<SupplierSummary>[] = [
    {
      key: 'name',
      header: 'Fornecedor',
      cell: (s) => (
        <div>
          <p className="font-medium">{s.name}</p>
          {s.document && <p className="text-xs text-ink-muted">{s.document}</p>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contato',
      cell: (s) => (
        <div className="text-xs">
          {s.contactName && <p className="text-sm text-ink">{s.contactName}</p>}
          {s.email && <p className="text-ink-muted">{s.email}</p>}
          {s.phone && <p className="text-ink-muted">{s.phone}</p>}
          {!s.contactName && !s.email && !s.phone && <span className="text-ink-muted">—</span>}
        </div>
      ),
    },
    {
      key: 'website',
      header: 'Site / loja',
      cell: (s) =>
        s.website ? (
          <a
            href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 hover:underline"
          >
            {s.website.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      hideOnMobile: true,
    },
  ];
  if (canEdit) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar ${s.name}`}
            onClick={() => setForm({ open: true, supplier: s })}
            icon={<Pencil className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Excluir ${s.name}`}
            onClick={() => setDeleting(s)}
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
          <p className="text-sm text-ink-muted">Fornecedores de filamentos e insumos.</p>
          {canEdit && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setForm({ open: true, supplier: null })}
            >
              Novo fornecedor
            </Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={suppliers.data}
          rowKey={(s) => s.id}
          loading={suppliers.isFetching}
          empty={<EmptyState icon={Truck} title="Nenhum fornecedor cadastrado" />}
        />
      </Card>

      <Modal
        open={form.open}
        onClose={() => setForm({ open: false, supplier: null })}
        title={form.supplier ? 'Editar fornecedor' : 'Novo fornecedor'}
      >
        <SupplierForm
          key={form.supplier?.id ?? 'new'}
          supplier={form.supplier}
          onDone={() => setForm({ open: false, supplier: null })}
        />
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Excluir fornecedor"
        message={
          <>
            O fornecedor <strong className="text-ink">{deleting?.name}</strong> sairá da lista.
            Rolos e insumos antigos continuam mostrando o nome.
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

const FIELDS = ['name', 'document', 'contactName', 'email', 'phone', 'website', 'notes'] as const;

function SupplierForm({
  supplier,
  onDone,
}: {
  supplier: SupplierSummary | null;
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
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierInputSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      document: supplier?.document ?? '',
      contactName: supplier?.contactName ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      website: supplier?.website ?? '',
      notes: supplier?.notes ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: (v: SupplierInput) =>
      supplier ? suppliersApi.update(supplier.id, v) : suppliersApi.create(v),
    onSuccess: async () => {
      await invalidate();
      toast.success(supplier ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
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
        <Field label="Nome" htmlFor="sp-name" error={errors.name?.message} required>
          <Input id="sp-name" autoFocus invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="CNPJ / CPF" htmlFor="sp-doc" error={errors.document?.message}>
          <Input id="sp-doc" {...register('document')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contato" htmlFor="sp-contact">
          <Input id="sp-contact" {...register('contactName')} />
        </Field>
        <Field label="E-mail" htmlFor="sp-email" error={errors.email?.message}>
          <Input id="sp-email" type="email" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Telefone" htmlFor="sp-phone">
          <Input id="sp-phone" inputMode="tel" {...register('phone')} />
        </Field>
      </div>
      <Field label="Site ou link da loja" htmlFor="sp-site">
        <Input id="sp-site" placeholder="loja.exemplo.com.br" {...register('website')} />
      </Field>
      <Field label="Observações" htmlFor="sp-notes">
        <Textarea id="sp-notes" rows={2} {...register('notes')} />
      </Field>
      <FormFooter
        onCancel={onDone}
        submitLabel={supplier ? 'Salvar' : 'Cadastrar fornecedor'}
        loading={mutation.isPending}
      />
    </form>
  );
}
