-- Referencia externa de la venta en el marketplace: el numero de orden que
-- entrega Falabella, Paris o Mercado Libre.
--
-- El caso de uso CU-05 la exige para poder conciliar contra el comprobante del
-- marketplace. Hoy no hay forma de saber a que venta del portal corresponde una
-- orden del ERP, de modo que la comision no se puede verificar contra nada.
--
-- Se agrega nullable porque las ordenes existentes no la tienen. La validacion
-- la exige solo al crear o editar una venta de tipo Marketplace, y hoy no hay
-- ninguna: las 272 operaciones con rastro de marketplace estan grabadas como
-- Venta sala o Venta Web.
ALTER TABLE "ventas"."ordenes" ADD COLUMN "marketplace_referencia" TEXT;

-- La referencia identifica la venta en el portal, asi que no deberia repetirse
-- dentro del mismo canal. Indice parcial: solo aplica a las que la tienen.
CREATE UNIQUE INDEX "ordenes_marketplace_canal_referencia_key"
    ON "ventas"."ordenes" ("marketplace_canal", "marketplace_referencia")
 WHERE "marketplace_canal" IS NOT NULL AND "marketplace_referencia" IS NOT NULL;
