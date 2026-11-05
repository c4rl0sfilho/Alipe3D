-- Sequência dos códigos de rolo (R-0001, R-0002...). Criada antes da tabela que a usa.
CREATE SEQUENCE "material_roll_code_seq";

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductFileKind" AS ENUM ('IMAGE', 'MODEL_STL', 'MODEL_3MF', 'PRINT_PROFILE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'PA', 'OTHER');

-- CreateEnum
CREATE TYPE "RollStatus" AS ENUM ('IN_STOCK', 'IN_USE', 'EMPTY', 'DISCARDED');

-- CreateEnum
CREATE TYPE "InventoryItemKind" AS ENUM ('SUPPLY', 'FINISHED_GOOD');

-- CreateEnum
CREATE TYPE "SupplyCategory" AS ENUM ('PACKAGING', 'LABEL', 'NOZZLE', 'BUILD_PLATE', 'COMPONENT', 'OTHER');

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('UN', 'PCT', 'CX', 'M', 'ROLO', 'KG', 'L');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE_IN', 'PRODUCTION_OUT', 'PRODUCTION_IN', 'ADJUSTMENT', 'LOSS', 'WASTE', 'RETURN_IN', 'RETURN_OUT');

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "sale_price" DECIMAL(12,2) NOT NULL,
    "estimated_weight_grams" DECIMAL(10,2) NOT NULL,
    "estimated_print_minutes" INTEGER NOT NULL,
    "min_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "color" VARCHAR(40),
    "material" VARCHAR(40),
    "size" VARCHAR(40),
    "model" VARCHAR(60),
    "sale_price" DECIMAL(12,2),
    "estimated_weight_grams" DECIMAL(10,2),
    "estimated_print_minutes" INTEGER,
    "min_stock" DECIMAL(12,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_files" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "kind" "ProductFileKind" NOT NULL,
    "original_name" VARCHAR(200) NOT NULL,
    "stored_name" VARCHAR(80) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_materials" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "material_id" UUID,
    "supply_item_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "notes" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "document" VARCHAR(20),
    "contact_name" VARCHAR(120),
    "email" VARCHAR(160),
    "phone" VARCHAR(30),
    "website" VARCHAR(200),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "manufacturer" VARCHAR(80) NOT NULL,
    "type" "MaterialType" NOT NULL,
    "color" VARCHAR(40) NOT NULL,
    "color_hex" CHAR(7),
    "min_stock_grams" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_rolls" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL DEFAULT ('R-'::text || lpad((nextval('material_roll_code_seq'::regclass))::text, 4, '0'::text)),
    "material_id" UUID NOT NULL,
    "supplier_id" UUID,
    "status" "RollStatus" NOT NULL DEFAULT 'IN_STOCK',
    "initial_weight_grams" DECIMAL(10,2) NOT NULL,
    "remaining_weight_grams" DECIMAL(10,2) NOT NULL,
    "spool_weight_grams" DECIMAL(10,2) NOT NULL,
    "purchase_cost" DECIMAL(12,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "lot_number" VARCHAR(60),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "material_rolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "kind" "InventoryItemKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sku" VARCHAR(40),
    "category" "SupplyCategory",
    "unit" "StockUnit" NOT NULL DEFAULT 'UN',
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "min_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "average_unit_cost" DECIMAL(14,6),
    "supplier_id" UUID,
    "product_variant_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "material_roll_id" UUID,
    "inventory_item_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "balance_after" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(14,6),
    "total_cost" DECIMAL(12,2),
    "reason" VARCHAR(300) NOT NULL,
    "negative_authorized" BOOLEAN NOT NULL DEFAULT false,
    "reference_type" VARCHAR(40),
    "reference_id" VARCHAR(64),
    "user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_deleted_at_idx" ON "products"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_files_stored_name_key" ON "product_files"("stored_name");

-- CreateIndex
CREATE INDEX "product_files_product_id_idx" ON "product_files"("product_id");

-- CreateIndex
CREATE INDEX "product_materials_material_id_idx" ON "product_materials"("material_id");

-- CreateIndex
CREATE INDEX "product_materials_supply_item_id_idx" ON "product_materials"("supply_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_materials_variant_id_material_id_key" ON "product_materials"("variant_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_materials_variant_id_supply_item_id_key" ON "product_materials"("variant_id", "supply_item_id");

-- CreateIndex
CREATE INDEX "materials_type_idx" ON "materials"("type");

-- CreateIndex
CREATE UNIQUE INDEX "material_rolls_code_key" ON "material_rolls"("code");

-- CreateIndex
CREATE INDEX "material_rolls_material_id_status_idx" ON "material_rolls"("material_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_product_variant_id_key" ON "inventory_items"("product_variant_id");

-- CreateIndex
CREATE INDEX "inventory_items_kind_deleted_at_idx" ON "inventory_items"("kind", "deleted_at");

-- CreateIndex
CREATE INDEX "inventory_movements_material_roll_id_occurred_at_idx" ON "inventory_movements"("material_roll_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_inventory_item_id_occurred_at_idx" ON "inventory_movements"("inventory_item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_type_occurred_at_idx" ON "inventory_movements"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_occurred_at_idx" ON "inventory_movements"("occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_supply_item_id_fkey" FOREIGN KEY ("supply_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rolls" ADD CONSTRAINT "material_rolls_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rolls" ADD CONSTRAINT "material_rolls_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_material_roll_id_fkey" FOREIGN KEY ("material_roll_id") REFERENCES "material_rolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Regras de integridade que o schema Prisma não expressa
-- =====================================================================

-- A sequência pertence à coluna (é removida junto com a tabela).
ALTER SEQUENCE "material_roll_code_seq" OWNED BY "material_rolls"."code";

-- Movimentação: exatamente um alvo (rolo OU item de estoque).
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_single_target_chk"
  CHECK (num_nonnulls("material_roll_id", "inventory_item_id") = 1);

-- Movimentação: quantidade nunca zero.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_nonzero_chk" CHECK ("quantity" <> 0);

-- Ficha técnica: exatamente um componente (filamento OU insumo) e quantidade positiva.
ALTER TABLE "product_materials"
  ADD CONSTRAINT "product_materials_single_component_chk"
  CHECK (num_nonnulls("material_id", "supply_item_id") = 1),
  ADD CONSTRAINT "product_materials_quantity_chk" CHECK ("quantity" > 0);

-- Produto acabado sempre ligado a uma variação; insumo nunca.
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_kind_variant_chk"
  CHECK (("kind" = 'FINISHED_GOOD') = ("product_variant_id" IS NOT NULL));

-- Rolo: pesos e custo não negativos; peso inicial positivo.
ALTER TABLE "material_rolls"
  ADD CONSTRAINT "material_rolls_weights_chk"
  CHECK ("initial_weight_grams" > 0 AND "spool_weight_grams" >= 0 AND "purchase_cost" >= 0);

-- No máximo uma variação padrão por produto.
CREATE UNIQUE INDEX "product_variants_one_default_idx"
  ON "product_variants" ("product_id") WHERE "is_default";

-- Mesma combinação de atributos não se repete no mesmo produto (variações não excluídas).
CREATE UNIQUE INDEX "product_variants_attributes_idx"
  ON "product_variants" (
    "product_id",
    COALESCE(lower("color"), ''),
    COALESCE(lower("material"), ''),
    COALESCE(lower("size"), ''),
    COALESCE(lower("model"), '')
  ) WHERE "deleted_at" IS NULL;

-- Nome de categoria único sem diferenciar maiúsculas.
CREATE UNIQUE INDEX "product_categories_name_ci_idx" ON "product_categories" (lower("name"));
