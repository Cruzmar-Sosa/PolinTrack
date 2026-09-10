-- DropForeignKey
ALTER TABLE "fumigations" DROP CONSTRAINT IF EXISTS "fumigations_daily_production_id_fkey";

-- AlterTable
ALTER TABLE "fumigations" ADD COLUMN IF NOT EXISTS "chemical_product" VARCHAR(150),
ADD COLUMN IF NOT EXISTS "dose" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "exposure_hours" INTEGER,
ADD COLUMN IF NOT EXISTS "observations" TEXT,
ALTER COLUMN "daily_production_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "fumigation_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fumigation_id" UUID NOT NULL,
    "daily_production_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "production_detail_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fumigation_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fumigation_details_fumigation_id_idx" ON "fumigation_details"("fumigation_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fumigation_details_daily_production_id_idx" ON "fumigation_details"("daily_production_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fumigation_details_product_id_idx" ON "fumigation_details"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fumigation_details_fumigation_id_daily_production_id_produc_key" ON "fumigation_details"("fumigation_id", "daily_production_id", "product_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fumigations_daily_production_id_fkey') THEN
    ALTER TABLE "fumigations" ADD CONSTRAINT "fumigations_daily_production_id_fkey" FOREIGN KEY ("daily_production_id") REFERENCES "daily_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fumigation_details_fumigation_id_fkey') THEN
    ALTER TABLE "fumigation_details" ADD CONSTRAINT "fumigation_details_fumigation_id_fkey" FOREIGN KEY ("fumigation_id") REFERENCES "fumigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fumigation_details_daily_production_id_fkey') THEN
    ALTER TABLE "fumigation_details" ADD CONSTRAINT "fumigation_details_daily_production_id_fkey" FOREIGN KEY ("daily_production_id") REFERENCES "daily_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fumigation_details_product_id_fkey') THEN
    ALTER TABLE "fumigation_details" ADD CONSTRAINT "fumigation_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fumigation_details_production_detail_id_fkey') THEN
    ALTER TABLE "fumigation_details" ADD CONSTRAINT "fumigation_details_production_detail_id_fkey" FOREIGN KEY ("production_detail_id") REFERENCES "production_details"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Enable Row Level Security and configure backend policy
ALTER TABLE "fumigation_details" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fumigation_details' AND policyname = 'polintrack_backend_full_access'
  ) THEN
    CREATE POLICY "polintrack_backend_full_access" 
    ON "fumigation_details" 
    FOR ALL TO "polintrack_admin" 
    USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Defensive backfill of historical fumigation records into fumigation_details (zero data loss)
-- Strategy A: For production orders with production_details (multi-product)
INSERT INTO "fumigation_details" ("id", "fumigation_id", "daily_production_id", "product_id", "production_detail_id", "created_at")
SELECT gen_random_uuid(), f.id, f.daily_production_id, pd.product_id, pd.id, f.created_at
FROM "fumigations" f
JOIN "production_details" pd ON pd.daily_production_id = f.daily_production_id
WHERE f.daily_production_id IS NOT NULL
ON CONFLICT ("fumigation_id", "daily_production_id", "product_id") DO NOTHING;

-- Strategy B: For legacy production orders where product_id is in daily_productions directly
INSERT INTO "fumigation_details" ("id", "fumigation_id", "daily_production_id", "product_id", "production_detail_id", "created_at")
SELECT gen_random_uuid(), f.id, f.daily_production_id, dp.product_id, NULL, f.created_at
FROM "fumigations" f
JOIN "daily_productions" dp ON dp.id = f.daily_production_id
WHERE f.daily_production_id IS NOT NULL AND dp.product_id IS NOT NULL
ON CONFLICT ("fumigation_id", "daily_production_id", "product_id") DO NOTHING;
