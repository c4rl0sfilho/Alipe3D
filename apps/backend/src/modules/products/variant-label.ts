interface VariantAttributes {
  isDefault: boolean;
  color: string | null;
  material: string | null;
  size: string | null;
  model: string | null;
}

/** Nome legível da variação: "Preto · PLA · G" ou "Padrão". */
export function variantLabel(variant: VariantAttributes): string {
  const parts = [variant.color, variant.material, variant.size, variant.model].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Padrão';
}

/** Nome do item de produto acabado no estoque. */
export function finishedGoodName(productName: string, variant: VariantAttributes): string {
  const label = variantLabel(variant);
  return label === 'Padrão' ? productName : `${productName} — ${label}`;
}
