-- El kardex es append-only: corregir un movimiento implica crear otro que lo
-- compense. Esto impide que una sesión SQL directa borre o reescriba historia.
-- Las bases de prueba se excluyen para que su limpieza de fixtures no altere
-- la regla aplicada a staging ni producción.
CREATE OR REPLACE FUNCTION bodega.proteger_kardex_inalterable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_database() LIKE '%test%' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'El kardex bodega.movimientos es inalterable; registre un movimiento compensatorio'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS movimientos_kardex_inalterable ON bodega.movimientos;
CREATE TRIGGER movimientos_kardex_inalterable
BEFORE UPDATE OR DELETE ON bodega.movimientos
FOR EACH ROW EXECUTE FUNCTION bodega.proteger_kardex_inalterable();
