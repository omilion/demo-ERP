-- Sólo se corrigen grafías inequívocas. Las filas sin estado y “Rechazada”
-- requieren una decisión de cobranza: no se convierten por inferencia.
UPDATE ventas.cobranza_historico
SET estado = CASE
  WHEN lower(btrim(estado)) = 'cancelada' THEN 'CANCELADA'
  WHEN lower(btrim(estado)) = 'nula' THEN 'NULA'
  WHEN lower(btrim(estado)) = 'pendiente' THEN 'PENDIENTE'
  ELSE estado
END
WHERE estado IS NOT NULL
  AND btrim(estado) <> ''
  AND lower(btrim(estado)) IN ('cancelada', 'nula', 'pendiente')
  AND estado NOT IN ('CANCELADA', 'NULA', 'PENDIENTE');
