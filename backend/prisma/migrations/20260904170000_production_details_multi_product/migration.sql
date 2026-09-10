-- Migration: 20260904170000_production_details_multi_product
-- Description: Introduce production_details table for multi-product daily productions,
-- migrate existing production records without data loss, and configure RLS.

-- 1. Create table production_details
CREATE TABLE IF NOT EXISTS "public"."production_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "daily_production_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_produced" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_details_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_details_daily_production_id_fkey" FOREIGN KEY ("daily_production_id") REFERENCES "public"."daily_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2. Create unique index and indexes on production_details
CREATE UNIQUE INDEX IF NOT EXISTS "production_details_daily_production_id_product_id_key" ON "public"."production_details"("daily_production_id", "product_id");
CREATE INDEX IF NOT EXISTS "production_details_daily_production_id_idx" ON "public"."production_details"("daily_production_id");
CREATE INDEX IF NOT EXISTS "production_details_product_id_idx" ON "public"."production_details"("product_id");

-- 3. Migrate existing records from daily_productions to production_details (zero data loss)
INSERT INTO "public"."production_details" ("id", "daily_production_id", "product_id", "quantity_produced", "created_at")
SELECT gen_random_uuid(), "id", "product_id", "quantity_produced", "created_at"
FROM "public"."daily_productions"
WHERE "product_id" IS NOT NULL
ON CONFLICT ("daily_production_id", "product_id") DO NOTHING;

-- 4. Enable Row Level Security and configure backend policy
ALTER TABLE "public"."production_details" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'production_details' AND policyname = 'polintrack_backend_full_access'
  ) THEN
    CREATE POLICY "polintrack_backend_full_access" 
    ON "public"."production_details" 
    FOR ALL TO "polintrack_admin" 
    USING (true) WITH CHECK (true);
  END IF;
END $$;
