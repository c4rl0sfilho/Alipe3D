-- A ordem passa a guardar QUANTAS peças foram dispensadas (reprovadas sem refabricação,
-- falhas sem refazer ou o que faltava ao encerrar), em vez de um indicador único:
-- assim encerrar uma parte não cancela peças que ainda não foram impressas.
ALTER TABLE "production_orders" DROP COLUMN "closed_short",
ADD COLUMN     "waived_quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_quantities_check";
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_quantities_check" CHECK (
  "quantity" > 0
  AND "produced_quantity" >= 0
  AND "approved_quantity" >= 0
  AND "rejected_quantity" >= 0
  AND "waived_quantity" >= 0
  AND "approved_quantity" + "rejected_quantity" <= "produced_quantity"
  AND "estimated_minutes" >= 0
  AND "estimated_weight_grams" >= 0
);
