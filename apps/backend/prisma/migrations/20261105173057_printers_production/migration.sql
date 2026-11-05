-- Sequência do código das ordens (OP-0001...). Criada antes da tabela que a usa.
CREATE SEQUENCE "production_order_code_seq";

-- CreateEnum
CREATE TYPE "PrinterStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'CLEANING', 'CALIBRATION', 'PART_REPLACEMENT', 'FIRMWARE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PENDING', 'PLANNED', 'IN_PROGRESS', 'PAUSED', 'FAILED', 'COMPLETED', 'INSPECTION', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('BED_ADHESION', 'NOZZLE_CLOG', 'FILAMENT_RUNOUT', 'FILAMENT_TANGLE', 'LAYER_SHIFT', 'WARPING', 'SPAGHETTI', 'POWER_OUTAGE', 'SLICING_ERROR', 'OPERATOR_CANCELLED', 'OTHER');

-- CreateTable
CREATE TABLE "printers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80),
    "model" VARCHAR(80) NOT NULL,
    "serial_number" VARCHAR(80),
    "acquired_at" DATE,
    "initial_hours" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "status" "PrinterStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_maintenances" (
    "id" UUID NOT NULL,
    "printer_id" UUID NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "performed_at" DATE NOT NULL,
    "responsible_name" VARCHAR(120) NOT NULL,
    "parts_replaced" VARCHAR(500),
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "next_maintenance_at" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "printer_maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL DEFAULT ('OP-'::text || lpad((nextval('production_order_code_seq'::regclass))::text, 4, '0'::text)),
    "variant_id" UUID NOT NULL,
    "material_id" UUID,
    "printer_id" UUID,
    "quantity" INTEGER NOT NULL,
    "produced_quantity" INTEGER NOT NULL DEFAULT 0,
    "approved_quantity" INTEGER NOT NULL DEFAULT 0,
    "rejected_quantity" INTEGER NOT NULL DEFAULT 0,
    "closed_short" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "due_date" DATE,
    "estimated_minutes" INTEGER NOT NULL,
    "estimated_weight_grams" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "cancel_reason" VARCHAR(300),
    "responsible_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "printer_id" UUID NOT NULL,
    "roll_id" UUID NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "planned_quantity" INTEGER NOT NULL,
    "produced_quantity" INTEGER NOT NULL DEFAULT 0,
    "estimated_grams" DECIMAL(10,2) NOT NULL,
    "estimated_minutes" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "paused_at" TIMESTAMPTZ(3),
    "paused_seconds" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" "FailureReason",
    "failure_notes" VARCHAR(500),
    "lost_minutes" INTEGER,
    "needs_reprint" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(1000),
    "started_by_id" UUID NOT NULL,
    "finished_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_inspections" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "approved_quantity" INTEGER NOT NULL,
    "rejected_quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "inspected_by_id" UUID NOT NULL,
    "inspected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "printers_code_key" ON "printers"("code");

-- CreateIndex
CREATE INDEX "printer_maintenances_printer_id_performed_at_idx" ON "printer_maintenances"("printer_id", "performed_at");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_code_key" ON "production_orders"("code");

-- CreateIndex
CREATE INDEX "production_orders_status_priority_idx" ON "production_orders"("status", "priority");

-- CreateIndex
CREATE INDEX "production_orders_printer_id_status_idx" ON "production_orders"("printer_id", "status");

-- CreateIndex
CREATE INDEX "production_orders_material_id_idx" ON "production_orders"("material_id");

-- CreateIndex
CREATE INDEX "production_orders_variant_id_idx" ON "production_orders"("variant_id");

-- CreateIndex
CREATE INDEX "print_jobs_printer_id_started_at_idx" ON "print_jobs"("printer_id", "started_at");

-- CreateIndex
CREATE INDEX "print_jobs_production_order_id_idx" ON "print_jobs"("production_order_id");

-- CreateIndex
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");

-- CreateIndex
CREATE INDEX "quality_inspections_production_order_id_idx" ON "quality_inspections"("production_order_id");

-- AddForeignKey
ALTER TABLE "printer_maintenances" ADD CONSTRAINT "printer_maintenances_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_maintenances" ADD CONSTRAINT "printer_maintenances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_roll_id_fkey" FOREIGN KEY ("roll_id") REFERENCES "material_rolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_finished_by_id_fkey" FOREIGN KEY ("finished_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Regras de integridade escritas à mão (não aparecem no schema.prisma)
-- =====================================================================

ALTER SEQUENCE "production_order_code_seq" OWNED BY "production_orders"."code";

ALTER TABLE "printers" ADD CONSTRAINT "printers_initial_hours_check" CHECK ("initial_hours" >= 0);
ALTER TABLE "printer_maintenances" ADD CONSTRAINT "printer_maintenances_cost_check" CHECK ("cost" >= 0);

ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_quantities_check" CHECK (
  "quantity" > 0
  AND "produced_quantity" >= 0
  AND "approved_quantity" >= 0
  AND "rejected_quantity" >= 0
  AND "approved_quantity" + "rejected_quantity" <= "produced_quantity"
  AND "estimated_minutes" >= 0
  AND "estimated_weight_grams" >= 0
);

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_values_check" CHECK (
  "planned_quantity" > 0
  AND "produced_quantity" >= 0
  AND "paused_seconds" >= 0
  AND "estimated_grams" >= 0
  AND ("finished_at" IS NULL OR "finished_at" >= "started_at")
  AND (("status" IN ('IN_PROGRESS', 'PAUSED')) = ("finished_at" IS NULL))
);

ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_quantities_check" CHECK (
  "approved_quantity" >= 0 AND "rejected_quantity" >= 0
  AND "approved_quantity" + "rejected_quantity" > 0
);

-- Uma impressão em andamento por impressora e por ordem
CREATE UNIQUE INDEX "print_jobs_one_active_per_printer" ON "print_jobs" ("printer_id")
  WHERE "status" IN ('IN_PROGRESS', 'PAUSED');
CREATE UNIQUE INDEX "print_jobs_one_active_per_order" ON "print_jobs" ("production_order_id")
  WHERE "status" IN ('IN_PROGRESS', 'PAUSED');

-- Baixa sem duplicidade: uma movimentação por (impressão ou inspeção, tipo, rolo/item)
CREATE UNIQUE INDEX "inventory_movements_production_once" ON "inventory_movements" (
  "reference_type", "reference_id", "type", COALESCE("material_roll_id", "inventory_item_id")
) WHERE "reference_type" IN ('PRINT_JOB', 'QUALITY_INSPECTION');
