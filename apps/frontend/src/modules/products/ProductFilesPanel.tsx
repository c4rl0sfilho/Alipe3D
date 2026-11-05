import {
  PRODUCT_FILE_KIND_LABELS,
  PRODUCT_FILE_KINDS,
  PRODUCT_FILE_RULES,
  type ProductDetail,
  type ProductFileInfo,
  type ProductFileKind,
} from '@alipe3d/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Download,
  FileText,
  Image as ImageIcon,
  Settings2,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { toApiRequestError } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import { catalogKeys, productsApi } from './catalog.api';
import { ProductImage } from './ProductImage';
import { formatBytes } from './product-ui';

const ICONS: Record<ProductFileKind, typeof FileText> = {
  IMAGE: ImageIcon,
  MODEL_STL: Box,
  MODEL_3MF: Box,
  PRINT_PROFILE: Settings2,
  DOCUMENT: FileText,
};

const ACCEPT = [...new Set(Object.values(PRODUCT_FILE_RULES).flatMap((r) => r.extensions))].join(
  ',',
);

export function ProductFilesPanel({
  product,
  canEdit,
}: {
  product: ProductDetail;
  canEdit: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ProductFileKind | ''>('');
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [deleting, setDeleting] = useState<ProductFileInfo | null>(null);

  const apply = (saved: ProductDetail) => {
    queryClient.setQueryData(catalogKeys.product(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      setProgress({ name: file.name, percent: 0 });
      try {
        apply(
          await productsApi.uploadFile(product.id, file, kind, (percent) =>
            setProgress({ name: file.name, percent }),
          ),
        );
        toast.success(`"${file.name}" enviado.`);
      } catch (error) {
        toast.error(`"${file.name}": ${toApiRequestError(error).message}`);
      }
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const download = async (file: ProductFileInfo) => {
    try {
      const blob = await productsApi.downloadFile(product.id, file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(toApiRequestError(error).message);
    }
  };

  const cover = useMutation({
    mutationFn: (file: ProductFileInfo) => productsApi.setCover(product.id, file.id),
    onSuccess: (saved) => {
      apply(saved);
      toast.success('Capa atualizada.');
    },
    onError: (error) => toast.error(toApiRequestError(error).message),
  });
  const remove = useMutation({
    mutationFn: (file: ProductFileInfo) => productsApi.removeFile(product.id, file.id),
    onSuccess: (saved) => {
      apply(saved);
      toast.success('Arquivo excluído.');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(null);
    },
  });

  const images = product.files.filter((f) => f.kind === 'IMAGE');

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select
            aria-label="Tipo de arquivo"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProductFileKind | '')}
            className="sm:w-64"
          >
            <option value="">Tipo: detectar pela extensão</option>
            {PRODUCT_FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {PRODUCT_FILE_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            id="product-file"
            onChange={(e) => void upload(e.target.files)}
          />
          <Button
            icon={<Upload className="size-4" />}
            onClick={() => inputRef.current?.click()}
            loading={!!progress}
          >
            Enviar arquivos
          </Button>
          <p className="text-xs text-ink-muted sm:ml-auto">
            {progress
              ? `Enviando ${progress.name}: ${progress.percent}%`
              : 'Imagens, STL, 3MF, perfis de impressão e PDF.'}
          </p>
        </Card>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative overflow-hidden rounded-card border border-line bg-surface"
            >
              <ProductImage
                productId={product.id}
                fileId={image.id}
                alt={image.originalName}
                className="aspect-square w-full"
              />
              {image.isCover && (
                <span className="absolute top-2 left-2 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-medium text-white">
                  Capa
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <Card>
        {product.files.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum arquivo"
            description="Envie fotos, modelos STL/3MF, perfis de impressão e documentação técnica."
          />
        ) : (
          <ul className="divide-y divide-line">
            {product.files.map((file) => {
              const Icon = ICONS[file.kind];
              return (
                <li key={file.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.originalName}</p>
                    <p className="text-xs text-ink-muted">
                      {PRODUCT_FILE_KIND_LABELS[file.kind]} · {formatBytes(file.sizeBytes)} ·{' '}
                      {formatDateTime(file.createdAt)}
                      {file.uploadedBy && ` · ${file.uploadedBy.name}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && file.kind === 'IMAGE' && !file.isCover && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Usar ${file.originalName} como capa`}
                        title="Usar como capa"
                        onClick={() => cover.mutate(file)}
                        icon={<Star className="size-4" />}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Baixar ${file.originalName}`}
                      title="Baixar"
                      onClick={() => void download(file)}
                      icon={<Download className="size-4" />}
                    />
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Excluir ${file.originalName}`}
                        title="Excluir"
                        onClick={() => setDeleting(file)}
                        icon={<Trash2 className="size-4 text-danger" />}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        title="Excluir arquivo"
        message={
          <>
            O arquivo <strong className="text-ink">{deleting?.originalName}</strong> será excluído
            definitivamente.
          </>
        }
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
