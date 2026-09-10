-- DropForeignKey
ALTER TABLE "daily_productions" DROP CONSTRAINT "daily_productions_product_id_fkey";

-- DropIndex
DROP INDEX "daily_productions_product_id_idx";

-- AlterTable
ALTER TABLE "daily_productions" ALTER COLUMN "product_id" DROP NOT NULL,
ALTER COLUMN "quantity_produced" DROP NOT NULL;

-- AlterTable
ALTER TABLE "production_details" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "wood_receipts" ADD COLUMN     "reglas_quantity" INTEGER,
ADD COLUMN     "yugos_quantity" INTEGER;

-- AddForeignKey
ALTER TABLE "daily_productions" ADD CONSTRAINT "daily_productions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
