-- Revert: OrdenTransporte fue redundante con el modelo Despacho ya existente
-- (Despacho ya tiene transporte, montoEnvio, direccion, seguimiento, etc.).
-- Se conecta el flujo real a Despacho en su lugar (handleCreateDespacho, ya
-- existia pero solo estaba cableado a la rama drawer sin uso).
DROP TABLE "ventas"."ordenes_transporte";
