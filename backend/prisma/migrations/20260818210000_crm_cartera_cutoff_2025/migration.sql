-- Regla comercial acordada: la cartera vigente comienza el 01-01-2025.
-- Se usa fecha de cotización cuando existe; en caso contrario, fecha del registro.
-- Los registros sin una fecha verificable se preservan tal como estaban para no clasificarlos por inferencia.
UPDATE "ventas"."crm_registros"
SET "es_historico" = (COALESCE("fecha_cotizacion", "fecha") < TIMESTAMP '2025-01-01 00:00:00')
WHERE COALESCE("fecha_cotizacion", "fecha") IS NOT NULL;
