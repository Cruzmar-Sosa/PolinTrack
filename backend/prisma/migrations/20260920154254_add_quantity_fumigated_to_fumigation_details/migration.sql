-- Step 1: Add quantity_fumigated as nullable first
ALTER TABLE "fumigation_details" ADD COLUMN IF NOT EXISTS "quantity_fumigated" INTEGER;

-- Step 2: Retrocompatible backfill: Assign production_detail_id and quantity_produced from production_details
UPDATE "fumigation_details" fd
SET "production_detail_id" = pd.id,
    "quantity_fumigated" = pd.quantity_produced
FROM "production_details" pd
WHERE pd.daily_production_id = fd.daily_production_id
  AND pd.product_id = fd.product_id
  AND fd.quantity_fumigated IS NULL;

-- Step 2b: Fallback for any remaining null rows (legacy monoproduct lot or default)
UPDATE "fumigation_details" fd
SET "quantity_fumigated" = COALESCE(
  (SELECT pd.quantity_produced FROM "production_details" pd WHERE pd.id = fd.production_detail_id),
  (SELECT dp.quantity_produced FROM "daily_productions" dp WHERE dp.id = fd.daily_production_id),
  1
)
WHERE fd.quantity_fumigated IS NULL;

-- Step 3: Enforce NOT NULL constraint
ALTER TABLE "fumigation_details" ALTER COLUMN "quantity_fumigated" SET NOT NULL;

-- Step 4: Drop old chemical fields from fumigations if they exist (clean zero-chemical policy)
ALTER TABLE "fumigations" DROP COLUMN IF EXISTS "chemical_product";
ALTER TABLE "fumigations" DROP COLUMN IF EXISTS "dose";
ALTER TABLE "fumigations" DROP COLUMN IF EXISTS "exposure_hours";
