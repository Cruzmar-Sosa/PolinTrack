-- CreateEnum
CREATE TYPE "CorrectionModule" AS ENUM ('WOOD_RECEIPT', 'DAILY_PRODUCTION', 'DISPATCH');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'CORRECTION';

-- CreateTable
CREATE TABLE "quantity_corrections" (
    "id" UUID NOT NULL,
    "module" "CorrectionModule" NOT NULL,
    "record_id" UUID NOT NULL,
    "record_code" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "corrected_by_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quantity_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_correction_items" (
    "id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "line_id" UUID,
    "field_name" VARCHAR(100) NOT NULL,
    "product_id" UUID,
    "previous_quantity" DECIMAL(12,2) NOT NULL,
    "new_quantity" DECIMAL(12,2) NOT NULL,
    "delta_quantity" DECIMAL(12,2) NOT NULL,
    "inventory_movement_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quantity_correction_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quantity_corrections_idempotency_key_key" ON "quantity_corrections"("idempotency_key");

-- CreateIndex
CREATE INDEX "quantity_corrections_module_record_id_idx" ON "quantity_corrections"("module", "record_id");

-- CreateIndex
CREATE INDEX "quantity_corrections_corrected_by_id_idx" ON "quantity_corrections"("corrected_by_id");

-- CreateIndex
CREATE INDEX "quantity_corrections_created_at_idx" ON "quantity_corrections"("created_at");

-- CreateIndex
CREATE INDEX "quantity_correction_items_correction_id_idx" ON "quantity_correction_items"("correction_id");

-- CreateIndex
CREATE INDEX "quantity_correction_items_line_id_idx" ON "quantity_correction_items"("line_id");

-- CreateIndex
CREATE INDEX "quantity_correction_items_product_id_idx" ON "quantity_correction_items"("product_id");

-- AddForeignKey
ALTER TABLE "quantity_corrections" ADD CONSTRAINT "quantity_corrections_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_correction_items" ADD CONSTRAINT "quantity_correction_items_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "quantity_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_correction_items" ADD CONSTRAINT "quantity_correction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_correction_items" ADD CONSTRAINT "quantity_correction_items_inventory_movement_id_fkey" FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- RLS SECURITY & APPEND-ONLY IMMUTABILITY (POLINTRACK GOVERNANCE)
-- ==============================================================================

-- 1. Enable RLS
ALTER TABLE "public"."quantity_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."quantity_correction_items" ENABLE ROW LEVEL SECURITY;

-- 2. Grant backend service role access
CREATE POLICY "polintrack_backend_full_access" ON "public"."quantity_corrections" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."quantity_correction_items" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);

-- 3. Append-only enforcement triggers
CREATE OR REPLACE FUNCTION prevent_quantity_correction_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Quantity corrections are append-only audit records and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_quantity_corrections
BEFORE UPDATE OR DELETE ON "public"."quantity_corrections"
FOR EACH ROW EXECUTE FUNCTION prevent_quantity_correction_mutation();

CREATE TRIGGER trg_immutable_quantity_correction_items
BEFORE UPDATE OR DELETE ON "public"."quantity_correction_items"
FOR EACH ROW EXECUTE FUNCTION prevent_quantity_correction_mutation();
