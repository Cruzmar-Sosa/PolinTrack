-- Migration: 20260902010000_enable_rls_security
-- Description: Enable Row Level Security (RLS) on all 17 operational tables,
-- and grant explicit full access policies exclusively to the backend database role (polintrack_admin).
-- Supabase PostgREST roles (anon, authenticated) have NO policies, enforcing Default-Deny on all public tables.

-- 1. Enable RLS on all 17 operational tables
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wood_species" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wood_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."client_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wood_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_productions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."production_wood_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fumigations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dispatch_headers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dispatch_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."return_headers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."return_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

-- 2. Create backend operational policies exclusively for polintrack_admin
CREATE POLICY "polintrack_backend_full_access" ON "public"."users" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."suppliers" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."wood_species" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."wood_types" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."products" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."client_centers" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."wood_receipts" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."daily_productions" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."production_wood_receipts" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."fumigations" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."dispatch_headers" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."dispatch_details" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."return_headers" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."return_details" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."inventory_adjustments" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."inventory_movements" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
CREATE POLICY "polintrack_backend_full_access" ON "public"."audit_logs" FOR ALL TO "polintrack_admin" USING (true) WITH CHECK (true);
