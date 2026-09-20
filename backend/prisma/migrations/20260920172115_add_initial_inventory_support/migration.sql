-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'INITIAL_INVENTORY';

-- AlterTable
ALTER TABLE "daily_productions" ADD COLUMN     "is_initial_inventory" BOOLEAN NOT NULL DEFAULT false;
