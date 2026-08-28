-- Cantidad adjudicada por linea en la cotizacion del CRM.
--
-- CU-03 exige convertir la licitacion parcial o totalmente segun lo adjudicado.
-- El legacy ya lo modelaba (cotizacion_licitacion_items.cant_adjudicados) y el
-- CRM que lo reemplaza no, de modo que era una regresion: al aprobar, la venta
-- se creaba por la cantidad cotizada y no por la adjudicada.
--
-- En los datos hay 221 lineas parciales sobre 26.708 adjudicadas, repartidas en
-- 64 cotizaciones. Poco en proporcion, pero son ventas facturadas de mas.
--
-- Nullable a proposito, y distinto del 0 del legacy:
--   NULL  todavia no se registra adjudicacion -> se vende la cantidad cotizada
--   0     linea no adjudicada                 -> no pasa a la venta
--   N     adjudicacion parcial o total
-- Con el default 0 del legacy no se puede distinguir "sin registrar" de "no me
-- adjudicaron nada", que son cosas distintas al momento de aprobar.
ALTER TABLE "ventas"."crm_cotizacion_items" ADD COLUMN "cant_adjudicados" INTEGER;

-- No se puede adjudicar mas de lo cotizado. El legacy tiene una fila que lo
-- incumple, senal de que sin restriccion pasa.
ALTER TABLE "ventas"."crm_cotizacion_items"
  ADD CONSTRAINT "crm_cotizacion_items_cant_adjudicados_check"
  CHECK ("cant_adjudicados" IS NULL OR ("cant_adjudicados" >= 0 AND "cant_adjudicados" <= "cantidad"));
