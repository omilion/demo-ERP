# Pasar a Taller

## Qué es
Flujo para enviar a producción los productos de una venta que requieren fabricación (productos "transitorios"), generando o actualizando su Orden de Trabajo (ODT).

## Dónde está
Ruta: Menú **Taller → Pasar a Taller** (`/pasar-taller`).

## Cómo hago lo principal

### Enviar productos al taller
1. Abre **Pasar a Taller** (o accede desde el detalle de la venta con "Gatillar Taller / ODT").
2. El sistema muestra los productos transitorios pendientes de la venta.
3. Selecciona el/los talleres que correspondan (Espumas, Confecciones, Madera/Externo) y la cantidad.
4. Confirma el envío: se crea o actualiza la ODT.

## Campos importantes
- **Producto transitorio:** producto que se fabrica en taller (no es de stock directo).
- **Taller:** Espumas, Confecciones o Madera/Externo, según el producto.

## Preguntas frecuentes
- **¿Tengo que pasar a taller manualmente siempre?** No necesariamente: al crear o actualizar una venta con productos transitorios, el sistema notifica al taller automáticamente. Este flujo sirve para hacerlo o ajustarlo de forma explícita.
- **¿Dónde sigue el avance?** En el módulo de Taller (ODTs) o en la vista de operario.
