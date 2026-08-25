-- Agrega pais a clientes y sucursales; default Chile porque historicamente
-- todos los clientes eran chilenos. Habilita despacho a Latinoamerica.
ALTER TABLE "clientes"."clientes" ADD COLUMN "pais" TEXT DEFAULT 'Chile';
ALTER TABLE "clientes"."cliente_sucursales" ADD COLUMN "pais" TEXT DEFAULT 'Chile';
