-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('ADMIN', 'CONTABILIDAD', 'CONSULTA');

-- CreateEnum
CREATE TYPE "WoodSpeciesEnum" AS ENUM ('TECA', 'PINO', 'OTRAS');

-- CreateEnum
CREATE TYPE "WoodTypeEnum" AS ENUM ('TIMBRE', 'PROCESADA');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PIE_TABLAR', 'PIEZAS');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('COMPLETED', 'RETURNED_PARTIAL', 'RETURNED_TOTAL');

-- CreateEnum
CREATE TYPE "ReturnTypeEnum" AS ENUM ('TOTAL', 'PARCIAL');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PRODUCTION', 'DISPATCH', 'RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('INCREMENT', 'DECREMENT');

-- CreateEnum
CREATE TYPE "ReasonType" AS ENUM ('ERROR_INGRESO', 'CUSTOM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "role" "RoleType" NOT NULL DEFAULT 'CONSULTA',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_id" VARCHAR(100),
    "phone" VARCHAR(50),
    "notes" TEXT,
    "document_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wood_species" (
    "id" UUID NOT NULL,
    "name" "WoodSpeciesEnum" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wood_species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wood_types" (
    "id" UUID NOT NULL,
    "name" "WoodTypeEnum" NOT NULL,
    "default_unit" "UnitOfMeasure" NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wood_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "dimensions" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_centers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wood_receipts" (
    "id" UUID NOT NULL,
    "lot_number" VARCHAR(50) NOT NULL,
    "receipt_date" DATE NOT NULL,
    "receipt_time" TIME NOT NULL,
    "supplier_id" UUID NOT NULL,
    "species_id" UUID NOT NULL,
    "wood_type_id" UUID NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "wood_status" VARCHAR(100),
    "guide_number" VARCHAR(100),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wood_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_productions" (
    "id" UUID NOT NULL,
    "production_lot" VARCHAR(50) NOT NULL,
    "production_date" DATE NOT NULL,
    "iso_week" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_produced" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_wood_receipts" (
    "id" UUID NOT NULL,
    "daily_production_id" UUID NOT NULL,
    "wood_receipt_id" UUID NOT NULL,

    CONSTRAINT "production_wood_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fumigations" (
    "id" UUID NOT NULL,
    "daily_production_id" UUID NOT NULL,
    "fumigation_date" DATE NOT NULL,
    "fumigation_time" TIME NOT NULL,
    "certificate_number" VARCHAR(100) NOT NULL,
    "pdf_file_path" VARCHAR(500) NOT NULL,
    "pdf_file_name" VARCHAR(255) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fumigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_headers" (
    "id" UUID NOT NULL,
    "invoice_number" VARCHAR(100) NOT NULL,
    "dispatch_date" DATE NOT NULL,
    "dispatch_time" TIME NOT NULL,
    "client_center_id" UUID NOT NULL,
    "vehicle_info" VARCHAR(100),
    "driver_name" VARCHAR(100),
    "observations" TEXT,
    "status" "DispatchStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_headers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_details" (
    "id" UUID NOT NULL,
    "dispatch_header_id" UUID NOT NULL,
    "daily_production_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_dispatched" INTEGER NOT NULL,
    "dimensions" VARCHAR(100) NOT NULL,
    "quantity_returned_accumulated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dispatch_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_headers" (
    "id" UUID NOT NULL,
    "dispatch_header_id" UUID NOT NULL,
    "return_date" DATE NOT NULL,
    "return_type" "ReturnTypeEnum" NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "observations" TEXT,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_headers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_details" (
    "id" UUID NOT NULL,
    "return_header_id" UUID NOT NULL,
    "dispatch_detail_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_returned" INTEGER NOT NULL,

    CONSTRAINT "return_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "adjustment_type" "AdjustmentType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previous_stock" INTEGER NOT NULL,
    "new_stock" INTEGER NOT NULL,
    "reason_type" "ReasonType" NOT NULL,
    "reason_notes" TEXT,
    "executed_by_id" UUID NOT NULL,
    "executed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "delta_quantity" INTEGER NOT NULL,
    "reference_table" VARCHAR(50) NOT NULL,
    "reference_id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performed_by_id" UUID NOT NULL,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "record_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "correction_reason" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "wood_species_name_key" ON "wood_species"("name");

-- CreateIndex
CREATE UNIQUE INDEX "wood_types_name_key" ON "wood_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_name_key" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "client_centers_name_key" ON "client_centers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "wood_receipts_lot_number_key" ON "wood_receipts"("lot_number");

-- CreateIndex
CREATE INDEX "wood_receipts_lot_number_idx" ON "wood_receipts"("lot_number");

-- CreateIndex
CREATE INDEX "wood_receipts_receipt_date_idx" ON "wood_receipts"("receipt_date");

-- CreateIndex
CREATE INDEX "wood_receipts_supplier_id_idx" ON "wood_receipts"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_productions_production_lot_key" ON "daily_productions"("production_lot");

-- CreateIndex
CREATE INDEX "daily_productions_production_lot_idx" ON "daily_productions"("production_lot");

-- CreateIndex
CREATE INDEX "daily_productions_production_date_idx" ON "daily_productions"("production_date");

-- CreateIndex
CREATE INDEX "daily_productions_iso_week_idx" ON "daily_productions"("iso_week");

-- CreateIndex
CREATE INDEX "daily_productions_product_id_idx" ON "daily_productions"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_wood_receipts_daily_production_id_wood_receipt_i_key" ON "production_wood_receipts"("daily_production_id", "wood_receipt_id");

-- CreateIndex
CREATE INDEX "fumigations_daily_production_id_idx" ON "fumigations"("daily_production_id");

-- CreateIndex
CREATE INDEX "fumigations_fumigation_date_idx" ON "fumigations"("fumigation_date");

-- CreateIndex
CREATE INDEX "fumigations_certificate_number_idx" ON "fumigations"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_headers_invoice_number_key" ON "dispatch_headers"("invoice_number");

-- CreateIndex
CREATE INDEX "dispatch_headers_invoice_number_idx" ON "dispatch_headers"("invoice_number");

-- CreateIndex
CREATE INDEX "dispatch_headers_dispatch_date_idx" ON "dispatch_headers"("dispatch_date");

-- CreateIndex
CREATE INDEX "dispatch_headers_client_center_id_idx" ON "dispatch_headers"("client_center_id");

-- CreateIndex
CREATE INDEX "dispatch_headers_status_idx" ON "dispatch_headers"("status");

-- CreateIndex
CREATE INDEX "dispatch_details_dispatch_header_id_idx" ON "dispatch_details"("dispatch_header_id");

-- CreateIndex
CREATE INDEX "dispatch_details_daily_production_id_idx" ON "dispatch_details"("daily_production_id");

-- CreateIndex
CREATE INDEX "dispatch_details_product_id_idx" ON "dispatch_details"("product_id");

-- CreateIndex
CREATE INDEX "return_headers_dispatch_header_id_idx" ON "return_headers"("dispatch_header_id");

-- CreateIndex
CREATE INDEX "return_headers_return_date_idx" ON "return_headers"("return_date");

-- CreateIndex
CREATE INDEX "return_details_return_header_id_idx" ON "return_details"("return_header_id");

-- CreateIndex
CREATE INDEX "return_details_dispatch_detail_id_idx" ON "return_details"("dispatch_detail_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_product_id_idx" ON "inventory_adjustments"("product_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_executed_at_idx" ON "inventory_adjustments"("executed_at");

-- CreateIndex
CREATE INDEX "inventory_adjustments_executed_by_id_idx" ON "inventory_adjustments"("executed_by_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_timestamp_idx" ON "inventory_movements"("product_id", "timestamp");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_table_reference_id_idx" ON "inventory_movements"("reference_table", "reference_id");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_idx" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "wood_receipts" ADD CONSTRAINT "wood_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wood_receipts" ADD CONSTRAINT "wood_receipts_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "wood_species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wood_receipts" ADD CONSTRAINT "wood_receipts_wood_type_id_fkey" FOREIGN KEY ("wood_type_id") REFERENCES "wood_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wood_receipts" ADD CONSTRAINT "wood_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_productions" ADD CONSTRAINT "daily_productions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_productions" ADD CONSTRAINT "daily_productions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_wood_receipts" ADD CONSTRAINT "production_wood_receipts_daily_production_id_fkey" FOREIGN KEY ("daily_production_id") REFERENCES "daily_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_wood_receipts" ADD CONSTRAINT "production_wood_receipts_wood_receipt_id_fkey" FOREIGN KEY ("wood_receipt_id") REFERENCES "wood_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fumigations" ADD CONSTRAINT "fumigations_daily_production_id_fkey" FOREIGN KEY ("daily_production_id") REFERENCES "daily_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fumigations" ADD CONSTRAINT "fumigations_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_headers" ADD CONSTRAINT "dispatch_headers_client_center_id_fkey" FOREIGN KEY ("client_center_id") REFERENCES "client_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_headers" ADD CONSTRAINT "dispatch_headers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_details" ADD CONSTRAINT "dispatch_details_dispatch_header_id_fkey" FOREIGN KEY ("dispatch_header_id") REFERENCES "dispatch_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_details" ADD CONSTRAINT "dispatch_details_daily_production_id_fkey" FOREIGN KEY ("daily_production_id") REFERENCES "daily_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_details" ADD CONSTRAINT "dispatch_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_headers" ADD CONSTRAINT "return_headers_dispatch_header_id_fkey" FOREIGN KEY ("dispatch_header_id") REFERENCES "dispatch_headers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_headers" ADD CONSTRAINT "return_headers_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_details" ADD CONSTRAINT "return_details_return_header_id_fkey" FOREIGN KEY ("return_header_id") REFERENCES "return_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_details" ADD CONSTRAINT "return_details_dispatch_detail_id_fkey" FOREIGN KEY ("dispatch_detail_id") REFERENCES "dispatch_details"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_details" ADD CONSTRAINT "return_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

