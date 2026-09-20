-- CreateEnum
CREATE TYPE "ReturnDestination" AS ENUM ('REPROCESO', 'DESECHO');

-- AlterTable
ALTER TABLE "fumigation_details" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "destination" "ReturnDestination",
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "return_details" ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "destination" "ReturnDestination" NOT NULL DEFAULT 'REPROCESO',
ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "return_details_product_id_idx" ON "return_details"("product_id");
