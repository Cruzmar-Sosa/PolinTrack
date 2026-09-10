-- TSK-20.3: Remove UNIQUE constraint on production_lot column in daily_productions.
-- The lot LT-DDMMYY-WXX is an operational day/week label shared across multiple
-- production records on the same date. The UUID primary key remains the true identifier.
-- This migration is non-destructive: no data is modified.

DROP INDEX IF EXISTS "daily_productions_production_lot_key";
