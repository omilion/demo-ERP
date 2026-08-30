# Auditoría del trabajo de Sebastián

Contrastado contra el plan de reparto, las fichas del levantamiento de Christopher y su informe de cierre del 30-08-2026.

## Resultado general

**El informe es fiable.** Verifiqué once afirmaciones contra el código y los datos, y **diez se sostienen**. La única que no es una omisión, no una inexactitud: no menciona cuatro pruebas que quedaron rojas.

Además cumplió el orden acordado en el reparto: le dijimos que el modelo de compromiso de pago tenía que venir antes que las alertas de cobranza, y eso fue exactamente lo que hizo.

Antes de entrar en las observaciones, una corrección propia: **en informes anteriores dije que las alertas 15/5/0 y el límite de 20 líneas por DTE estaban pendientes. Las dos cosas estaban hechas.** Busqué en el lugar equivocado — el centro de notificaciones y las rutas de facturación — cuando viven en `cobranza/gestion.js` y `facturacion/documento.js`. Los reporto acá corregidos.

---

## Lo verificado

| Afirmación del informe | Verificación |
|---|---|
| Stock físico, disponible, reservado y dañado | ✅ `stock_reservado`, `stock_danado` con restricciones en base |
| Kardex con saldos antes/después | ✅ `stock_anterior`, `stock_posterior` y deltas por movimiento |
| "El flujo sólo expone lectura y creación de movimientos" | ✅ no existen `PUT` ni `DELETE` sobre movimientos |
| Código de barras obligatorio en altas | ✅ `min(3, 'codigoBarra requerido')` en `create.js` |
| Validación de códigos repetidos | ✅ `validateCodigoBarraUnico` en altas, cambios e importaciones |
| Cadena Patio → Didáctico → Reparto → Entregado | ✅ con transiciones válidas declaradas |
| **Máximo 20 líneas por DTE** | ✅ `MAX_DTE_DETAIL_LINES` con mensaje operativo |
| **Alertas de cobranza 15/5/0** | ✅ `deriveCompromisoAlert` con los tres umbrales y severidad |
| Venta de sala sin ficha de cliente | ✅ y no sólo en la base: la API tiene la excepción explícita |
| Priorización por fecha comprometida | ✅ ordena por `fechaEntregaCompromiso` con respaldo en `plazo` |
| Migraciones seguras contra datos reales | ✅ las 85 aplican limpio sobre copia de producción |

**Sobre las migraciones**, verificado aparte: la restricción de stock no es decorativa. Rechaza sobrecomprometer (`10` de stock con `9` reservado y `5` dañado) y rechaza reservar sobre saldo negativo, mientras acepta el saldo negativo histórico sin reserva. La reescritura fue mejor que lo que habíamos sugerido —nosotros propusimos sólo `NOT VALID`, que evita el bloqueo pero deja la regla mal formulada.

---

## Observaciones

### [ALTA] Cuatro pruebas quedaron rojas y el informe no las menciona

**Dónde:** `24cf811` — feat(finanzas): completa cobranza y trazabilidad DTE

**Qué pasa:**

```
categorias.test.js          validates category/subcategory consistency on product writes
facturacion-engine.test.js  emitir() assigns a folio, builds signed XML         (×2)
facturacion-routes.test.js  rechaza reanudar un CAF de certificacion anterior
```

Las tres últimas dan el mismo error: *"Completa los datos tributarios del receptor antes de facturar. Faltan: giro, dirección, comuna."*

**Cómo reproducirlo:**

```bash
git checkout 24cf811~1 && npx vitest run test/facturacion-engine.test.js test/categorias.test.js
# 8 passed

git checkout 24cf811 && npx vitest run test/facturacion-engine.test.js test/categorias.test.js
# 3 failed
```

**Por qué importa:** es la validación nueva de datos tributarios funcionando; los fixtures de prueba no traen esos campos. El arreglo probablemente es de una línea en cada fixture. Pero el informe dice *"no se declara una ejecución completa de la suite como aprobada"* sin nombrar qué quedó fallando, y eso deja al lector suponiendo que es deuda histórica cuando llegó con este trabajo.

**Sugerencia:** completar `giro`, `direccion` y `comuna` en los clientes de prueba.

---

### [MEDIA] Una migración que falla deja la base a medias y bloquea las siguientes

**Dónde:** `20260828_SB_stock_operacional_kardex`, antes del arreglo `3b2ff27`

**Qué pasa:** cuando la restricción falló, las columnas que la migración alcanzó a crear **se quedaron**. Reintentarla daba `column "stock_reservado" already exists`, y Prisma bloqueaba todo lo posterior con `P3009`.

**Cómo reproducirlo:** ya no se puede — el arreglo lo evita. Quedó registrado sobre la copia de producción antes de `3b2ff27`.

**Por qué importa:** en producción eso significa que el deploy se detiene, la base queda inconsistente y hay que entrar a mano a borrar columnas antes de poder desplegar cualquier otra cosa. No es el caso hoy, pero conviene como criterio: **una migración que agrega columnas y una restricción en el mismo archivo puede dejar residuo si la restricción falla.**

**Sugerencia:** separar en dos migraciones, o `NOT VALID` desde el principio cuando la restricción toca datos históricos.

---

### [MEDIA] La relación existe por clave foránea pero no está declarada

**Dónde:** `schema.prisma` — modelos `Odt` y `Orden`

| Modelo | Guarda | No declara |
|---|---|---|
| `Odt` | `ordenId` | relación con `Orden` |
| `Orden` | — | relación con `FactDocumento` |

**Cómo reproducirlo:** un `where` anidado como `odt: { orden: { is: { userId } } }` compila y falla en tiempo de ejecución con 500.

**Por qué importa:** nos costó tres veces esta semana. Obliga a resolver en dos consultas donde un `include` bastaría, y el error no aparece hasta que la ruta se ejecuta.

**Sugerencia:** declarar las dos relaciones. Es aditivo y no cambia el esquema físico.

---

### [MEDIA] `Odt.vendedorId` está vacío en las 5.772 órdenes de trabajo

**Cómo reproducirlo:**

```sql
select count(*) total, count(vendedor_id) con_vendedor, count(orden_id) con_orden
  from taller.odts where eliminado = false;
-- 5772 | 0 | 5772
```

**Por qué importa:** el campo sugiere que se puede identificar al vendedor desde la OT, y no se puede — hay que ir por `ordenId`. Cualquiera que lo use va a obtener una lista vacía sin entender por qué.

**Sugerencia:** poblarlo al crear la OT, o quitarlo.

---

### [BAJA] El aviso de OT atrasada no distinguía a quién le tocaba

**Dónde:** `notificaciones/index.js`, bloque de taller

**Qué pasaba:** una cortadora recibía las OT atrasadas de espuma y madera. **Ya lo corregimos** —quien tiene `taller.gestion` ve toda la carga y el operario ve lo suyo— pero lo dejamos anotado porque el criterio es tuyo: si prefieres que todo el taller vea todos los atrasos, se revierte.

---

## Contraste con las fichas del levantamiento

De los requerimientos que le tocaban por área:

**Bodega y despacho** — cerró el más grande (disponible/reservado/dañado), el kardex, el código de barras y la cadena de despacho. Queda el **KPI de tiempos** OC → recepción → interno → despacho, que no aparece en el informe ni en el código.

**Finanzas** — cerró los cinco: datos tributarios, boleta anónima, 20 líneas, trazabilidad con reporte de excepciones, y cobranza completa con gestiones, compromisos, alertas y conciliación.

**Talleres** — cerró estados, rechazo con causa, priorización y aviso de término. Lo que queda depende de datos que no existen: **0 recetas cargadas sobre 37.162 productos** bloquea la explosión de materiales y las mermas de espuma. Él mismo lo deja anotado.

---

## Lo que queda, y no es de ninguno de los dos

- **51 grupos de código de barras duplicado** — 2 son relleno (`0`, `1`); los otros 49 son códigos reales repetidos y necesitan criterio. Un par se ve como error de tipeo del código interno (`JUEGJAI1538` vs `JUEGJAI538`).
- **138 productos activos con stock negativo**, el peor en −38. Mercadería que salió sin haber entrado.
- **Recetas y ubicaciones** — 0 y 34.732 respectivamente.
- **Regla de descuento de prueba activa en producción** desde el 12-08, prioridad 500, autoaprobando 10% en silencio para tipo Normal + categoría Sillas.

---

## Nota sobre nuestro propio proceso

Rompimos el acuerdo de avisar antes de tocar el área del otro: etiquetamos por función `facturacion`, `despacho` y `bodega`, que son tus archivos. El cambio es aditivo y nadie pierde acceso, pero corresponde decirlo acá y no que lo descubras en un diff.

Y sobre el método: en esta sesión creímos ver tres agujeros de seguridad —en el asistente de IA, en los endpoints de `admin` y en cobranza— y **los tres eran falsos**. La guardia estaba en otro lugar o nuestra prueba estaba mal. Por eso cada observación de este informe trae cómo reproducirla: si no se puede verificar, no se puede ni resolver ni descartar.
