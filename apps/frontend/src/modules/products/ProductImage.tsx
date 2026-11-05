import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { cn } from '@/utils/cn';
import { productsApi } from './catalog.api';

interface ProductImageProps {
  productId: string;
  fileId: string | null;
  alt: string;
  className?: string;
}

/**
 * Imagem protegida: baixa o arquivo com o token da sessão e exibe por URL local (blob:).
 * O cache do TanStack Query evita baixar de novo a mesma imagem.
 */
export function ProductImage({ productId, fileId, alt, className }: ProductImageProps) {
  const { data } = useQuery({
    queryKey: ['product-image', productId, fileId],
    queryFn: () => productsApi.downloadFile(productId, fileId ?? '', true),
    enabled: !!fileId,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
  });
  const url = useMemo(() => (data ? URL.createObjectURL(data) : null), [data]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  if (!url) {
    return (
      <span
        className={cn('flex items-center justify-center bg-canvas text-ink-muted/60', className)}
        aria-hidden={!fileId}
      >
        <Package className="size-1/2 max-h-8 max-w-8" />
      </span>
    );
  }
  return <img src={url} alt={alt} className={cn('object-cover', className)} />;
}
