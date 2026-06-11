-- ODTs can be created and operated independently from a venta/orden.
-- A previous NOT VALID check constraint still blocks updates on legacy rows
-- with orden_id NULL, including ordinary state transitions from Taller.

ALTER TABLE "taller"."odts"
  DROP CONSTRAINT IF EXISTS "odts_orden_id_required_new";
