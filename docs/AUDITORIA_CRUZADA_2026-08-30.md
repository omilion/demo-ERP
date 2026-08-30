# Auditoría cruzada — 30-08-2026

Cada lado revisa el trabajo del otro y devuelve sus observaciones en un archivo. Este documento tiene las dos mitades:

- **Parte 1** — lo que entregamos nosotros, para que Sebastián lo audite.
- **Parte 2** — lo que observamos de su trabajo.
- **Parte 3** — el formato para devolver observaciones.

El reparto por área funcionó: en dos días, siete migraciones entre ambos el mismo día, **cero conflictos de esquema**. El único choque fue un párrafo del mismo documento.

---

# Parte 1 — Nuestro trabajo, para que lo audites

Rama `area-a-ventas`, 8 commits sobre `main`, 32 archivos, ~1.700 líneas. Estado: **959 tests pasan**.

## 1.1 Grafías de tipo de venta — `2d81e3a` y anteriores

**Qué encontramos.** Cinco módulos definían por su cuenta qué grafías cuentan como cada tipo, con conjuntos distintos. El mismo filtro entregaba totales distintos según la pantalla.

| Filtro | Antes devolvía | Ahora |
|---|---|---|
| Ventas · Licitación | 5 | 2.653 |
| Comisiones · Licitación | 5 | 2.653 |

**Qué revisar.** El de comisiones afecta pagos: el reporte contemplaba el mojibake pero no la grafía sin tilde, que es la mayoritaria. Vale la pena que confirmes el criterio.

**Decisión de negocio aplicada:** `Normal` es la venta simple, un tipo propio, no una forma de escribir venta de sala. Sale del agrupamiento de mostrador **pero se mantiene en el KPI del dashboard** — si no, esas 60 ventas no caían en ningún cubo y desaparecían del total vendido.

## 1.2 Casos de uso de ventas — `2d81e3a`, `7db3684`

Los seis cerrados o verificados. Tres defectos que la revisión no había detectado:

1. **Compra Ágil se ofrecía al editar una venta y el backend la rechazaba** con 400.
2. **El CRM no mapeaba `COMPRA_AGIL` a ningún tipo de orden** — una oportunidad ganada se habría guardado como `Normal` y contado como venta de mostrador. Latente: no alcanzó a producir datos malos.
3. **El mapa inverso tenía una entrada muerta** (`CONVENIO_MARCO` no es canal del CRM) y le faltaban dos vivas.

**Adjudicación parcial** era una regresión, no una función faltante: el legacy la modelaba y el CRM no, así que aprobar una adjudicación parcial facturaba por el total cotizado. 221 líneas parciales en 64 cotizaciones.

**Qué revisar.** El campo es nullable a propósito, distinto del `default 0` del legacy: `null` = no registrada (se vende lo cotizado), `0` = no adjudicada (no pasa a la venta). Con el default no se pueden separar, y llevan a ventas distintas.

## 1.3 Marketplace — script en `backend/scripts/reclasificar-marketplace.mjs`

276 ventas con rastro del canal, ninguna clasificada, 0 con comisión registrada.

**Lo relevante:** la liquidación del portal quedó escrita en las observaciones y la aritmética cuadra exacto, así que **la comisión histórica es recuperable**. El script clasifica en dos niveles: 132 de alta confianza con aritmética verificada, 118 media, 16 para revisión manual.

**No aplicado a producción.** Dry-run por defecto.

## 1.4 Permisos por función — `4986b8e`, `ea9f6db`, `7db3684`

**El caso que lo motivó:** para que bodega marcara una entrega había que darle `ventas:write`, lo que además la habilitaba a crear y editar ventas.

Regla: gana lo más específico; si no hay entrada por función, cae al módulo. **Nada de lo que hoy funciona deja de funcionar.**

**Qué revisar con atención — toca tus archivos.** Etiquetamos `facturacion`, `despacho` y `bodega`. El acuerdo decía avisar antes; no lo hicimos. El cambio es mecánico y aditivo, pero es una excepción a nuestra propia regla y preferimos decirlo:

| Módulo | Separación |
|---|---|
| facturación | `emitir` · `anular` · `folios` |
| despacho | `packing` (bodega) · `guias` (despacho) |
| bodega | `movimientos` (inventario) · `compras` (proveedores y precios) |

El efecto concreto: **quien factura emite y envía, y ya no administra CAF ni folios.** Antes venían en el mismo permiso.

**Corregimos un error de nuestro propio plan.** Decía que las cortadoras tendrían `taller.avance` únicamente; no era alcanzable, porque el rol `taller` otorga el módulo en bloque y todo cae ahí. De eso salió el rol `taller_operario`.

## 1.5 Lo que ve cada rol — `4986b8e`

El tablero mostraba lo mismo a todos: una cortadora veía el total vendido y las cuentas por pagar a proveedores.

**El permiso `ai` no hacía nada.** El comentario del módulo decía que el acceso se controlaba con `rbac('ai','read')`; el código nunca lo aplicaba — era un `role === 'admin'` fijo. Como `ai` es asignable desde Accesos, asignarlo no producía efecto. Corregido sin ampliar el acceso a nadie.

## 1.6 Notificaciones — `2b10cfa`, `b85b5e5`, `23550b3`

Cuatro disparadores nuevos. En los cuatro casos **el dato ya existía y nadie avisaba**:

| Aviso | Para quién | Qué existía antes |
|---|---|---|
| Rechazo del taller | La vendedora de esa venta | El motivo, sólo en la bitácora |
| Trabajo asignado | El operario | `operarioResponsableId`, sin uso |
| Stock crítico | Quien repone | `stockCritico`, sólo un correo por cron |
| Entregado sin facturar | Quien emite | El filtro, había que ir a buscarlo |

**Qué revisar.** El de stock mide el **disponible**, no el físico — usa tus campos nuevos. Con 10 unidades y 8 reservadas quedan 2 vendibles; mirando el físico el producto parece sano y el aviso llega tarde. Confirma que el criterio te calce.

También acotamos tu aviso de OT atrasada: antes una cortadora recibía los atrasos de espuma y madera. Ahora quien tiene `taller.gestion` ve toda la carga y el operario ve lo suyo.

## 1.7 Reglas de descuento — `a21dad0`

Tres reglas iniciales, **cargadas sólo en local**. El módulo rechazaba todo descuento porque sin reglas no hay contra qué evaluar.

## 1.8 Los 11 archivos de test

`personas-recorrido` es el más importante para ti: recorre el proceso de cada persona contra la API real y pregunta las dos cosas que importan — *puede hacer su trabajo* y *no puede hacer el de otro*.

`permisos-front-back-coinciden` compara ambos resolvedores sobre 810 combinaciones. Front y back declaran el mismo modelo en dos archivos distintos y ya divergieron una vez.

---

# Parte 2 — Observaciones sobre tu trabajo

Tu avance en dos días fue sólido: cerraste el ítem más grande de bodega (stock operacional y kardex), el modelo de cobranza completo, y la boleta anónima que estaba abierta como CU-01.

**Respetaste el orden acordado.** Te dijimos que antes de las alertas 15/5/0 había que definir el modelo de compromiso de pago. Hiciste el modelo y no las alertas — exactamente esa secuencia.

## 2.1 Bloqueante resuelto — cómo lo encontramos

Tus dos migraciones fallaban contra datos reales, y el deploy corre `prisma migrate deploy`:

```
20260828_SB_codigo_barra_unico       51 grupos duplicados, 112 productos
20260828_SB_stock_operacional_kardex 138 productos con stock negativo
```

Las arreglaste bien. En la segunda hiciste algo mejor de lo que sugerimos: **reescribiste la restricción** en vez de sólo marcarla `NOT VALID`. Verificado contra la copia de producción — las 85 migraciones aplican limpio, y la restricción rechaza sobrecomprometer y aceptar reserva sobre saldo negativo.

**Lo que sí conviene mirar:** cuando la migración falló, **las columnas que alcanzó a crear se quedaron**. Reintentarla daba `column already exists`, y Prisma bloqueaba todo con P3009. En producción eso significa entrar a mano antes de poder desplegar cualquier cosa. Ya no aplica con el arreglo, pero vale como criterio para las próximas.

## 2.2 Pendiente — 4 tests rojos

Llegaron con tu merge y siguen en `main`:

```
categorias.test.js          validates category/subcategory consistency
facturacion-engine.test.js  emitir() assigns a folio (×2)
facturacion-routes.test.js  rechaza reanudar un CAF
```

Los tres últimos dan el mismo error: *"Completa los datos tributarios del receptor antes de facturar. Faltan: giro, dirección, comuna."* Es tu validación nueva; probablemente los fixtures no traen esos campos.

Verificado que **no son nuestros**: fallan igual con el árbol limpio.

## 2.3 Pendiente — saneamiento de inventario

**138 productos activos con stock negativo**, el peor en −38. Ya no bloquean el deploy, pero son mercadería que salió sin haber entrado.

**51 grupos de código de barras duplicado.** 2 son relleno (`0`, `1`) y se pueden anular; los otros 49 son códigos reales repetidos y necesitan criterio de Plastimar. Uno de los pares se ve como error de tipeo del código interno (`JUEGJAI1538` vs `JUEGJAI538`).

## 2.4 Observación de diseño — la relación que falta

Nos tropezamos **tres veces** con lo mismo:

| Modelo | Guarda | No declara |
|---|---|---|
| `Odt` | `ordenId` | relación con `Orden` |
| `Orden` | — | relación con `FactDocumento` |

Obliga a resolver en dos consultas donde un `include` bastaría, y es fácil escribir un `where` anidado que falla en tiempo de ejecución. No es urgente, pero si vas a tocar el esquema, declararlas ahorra trabajo futuro.

También: **`Odt.vendedorId` está vacío en las 5.772 OT**. No sirve para identificar al vendedor; hay que ir por `ordenId`.

---

# Parte 3 — Formato para devolver observaciones

Un archivo por lado, en `docs/auditoria/`. Por cada observación:

```markdown
### [ALTA | MEDIA | BAJA] Título breve

**Dónde:** archivo:línea o commit
**Qué pasa:** el hecho, sin interpretación
**Cómo reproducirlo:** el comando o el paso
**Por qué importa:** qué se rompe o qué cuesta si queda así
**Sugerencia:** opcional
```

**Severidad:**

- **ALTA** — rompe producción, pierde datos, o expone algo que no debería. Se arregla antes de mergear.
- **MEDIA** — funciona pero está mal resuelto, o va a doler pronto.
- **BAJA** — criterio, nombres, deuda menor.

**Dos reglas para que la auditoría sirva:**

Primero, **una observación sin cómo reproducirla es una opinión**. Si no se puede verificar, no se puede resolver ni descartar.

Segundo, **verificar antes de reportar**. Nos pasó tres veces en esta sesión: creímos ver un agujero de seguridad en el asistente de IA, otro en los endpoints de `admin`, y un tercero en cobranza. Los tres eran falsos — la guardia estaba en otro lugar, o la prueba estaba mal. Correr el caso antes de escribirlo ahorra la vuelta entera.

---

## Qué queda para Plastimar

No depende de ninguno de los dos, y es lo que más brechas cierra por peso:

- **Recetas** — 0 cargadas sobre 37.162 productos. Bloquea casi toda el área de espuma.
- **Ubicaciones** — 34.732 productos sin asignar. Bloquea picking y código de barras.
- **Reglas de descuento con Paulina** — las tres cargadas son un punto de partida, no la política.
- **Regla de prueba en producción** — activa desde el 12-08 con prioridad 500, la más alta. Autoaprueba 10% en silencio para tipo Normal + categoría Sillas.
- **Los 49 códigos de barra repetidos** y los 138 saldos negativos.
