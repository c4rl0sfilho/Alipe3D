import type {
  ApiSuccess,
  BillOfMaterialsInput,
  CategoryInput,
  CategorySummary,
  ListProductsQuery,
  ProductDetail,
  ProductFileKind,
  ProductInput,
  ProductListItem,
  VariantInput,
} from '@alipe3d/shared';
import { api, request, requestPage, toApiRequestError } from '@/services/api';
import { cleanParams } from '@/utils/params';

async function noContent(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    throw toApiRequestError(error);
  }
}

export const categoriesApi = {
  list: () => request(api.get<ApiSuccess<CategorySummary[]>>('/categories')),
  create: (input: CategoryInput) =>
    request(api.post<ApiSuccess<CategorySummary>>('/categories', input)),
  update: (id: string, input: CategoryInput) =>
    request(api.put<ApiSuccess<CategorySummary>>(`/categories/${id}`, input)),
  remove: (id: string) => noContent(api.delete(`/categories/${id}`)),
};

export const productsApi = {
  list: (query: ListProductsQuery) =>
    requestPage(
      api.get<ApiSuccess<ProductListItem[]>>('/products', { params: cleanParams(query) }),
    ),
  get: (id: string) => request(api.get<ApiSuccess<ProductDetail>>(`/products/${id}`)),
  create: (input: ProductInput) => request(api.post<ApiSuccess<ProductDetail>>('/products', input)),
  update: (id: string, input: ProductInput) =>
    request(api.put<ApiSuccess<ProductDetail>>(`/products/${id}`, input)),
  remove: (id: string) => noContent(api.delete(`/products/${id}`)),

  createVariant: (productId: string, input: VariantInput) =>
    request(api.post<ApiSuccess<ProductDetail>>(`/products/${productId}/variants`, input)),
  updateVariant: (variantId: string, input: VariantInput) =>
    request(api.put<ApiSuccess<ProductDetail>>(`/products/variants/${variantId}`, input)),
  removeVariant: (variantId: string) =>
    request(api.delete<ApiSuccess<ProductDetail>>(`/products/variants/${variantId}`)),
  setBillOfMaterials: (variantId: string, input: BillOfMaterialsInput) =>
    request(
      api.put<ApiSuccess<ProductDetail>>(
        `/products/variants/${variantId}/bill-of-materials`,
        input,
      ),
    ),

  uploadFile: (
    productId: string,
    file: File,
    kind: ProductFileKind | '',
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    // O campo "kind" vem antes do arquivo para o servidor já conhecê-lo ao receber o envio
    if (kind) form.append('kind', kind);
    form.append('file', file);
    return request(
      api.post<ApiSuccess<ProductDetail>>(`/products/${productId}/files`, form, {
        timeout: 10 * 60_000,
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      }),
    );
  },
  setCover: (productId: string, fileId: string) =>
    request(api.patch<ApiSuccess<ProductDetail>>(`/products/${productId}/files/${fileId}/cover`)),
  removeFile: (productId: string, fileId: string) =>
    request(api.delete<ApiSuccess<ProductDetail>>(`/products/${productId}/files/${fileId}`)),

  /** Baixa o arquivo com o token da sessão (o link direto não carrega a autenticação). */
  downloadFile: async (productId: string, fileId: string, inline = false): Promise<Blob> => {
    try {
      const response = await api.get<Blob>(`/products/${productId}/files/${fileId}`, {
        params: inline ? { inline: 1 } : undefined,
        responseType: 'blob',
        timeout: 10 * 60_000,
      });
      return response.data;
    } catch (error) {
      throw toApiRequestError(error);
    }
  },
};

export const catalogKeys = {
  categories: ['categories'] as const,
  products: (query?: ListProductsQuery) => ['products', query] as const,
  product: (id: string) => ['product', id] as const,
};
