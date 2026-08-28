# Reparto de áreas — para coordinar con Sebastián

Sebas: esto es una propuesta de reparto, no una bajada. Si algún área te calza distinto, la cambiamos antes de empezar. Lo importante es que quede fijado **antes** de tocar código, porque venimos pisándonos.

---

## 1. Por qué

Medido sobre los últimos 40 commits: **27 archivos fueron tocados por los dos**. Y las últimas ocho migraciones salieron alternadas, sin coordinación:

| Migración | Autor |
| --- | --- |
| `20260819003000_add_odt_legacy_n_interno` | Sebastián |
| `20260819110000_crm_licitacion_source` | Codex |
| `20260824120000_user_cargo` | Codex |
| `20260824180000_orden_cliente_relation` | Codex |
| `20260824200000_add_cliente_pais` | Sebastián |
| `20260826020000_descuentos_auditoria_aprobacion` | Codex |
| `20260826120000_add_role_coordinador_comercial` | Sebastián |

No chocaron por suerte: nadie tocó la misma tabla el mismo día. Con lo que viene —que es más grande— la suerte no alcanza.

Además hubo tres incidentes concretos: una rama creada mientras el otro trabajaba, trabajo sin commitear durante horas que hubo que editar para poder avanzar, y **dos versiones en paralelo de la ficha de cliente** resolviendo exactamente lo mismo.

---

## 2. La regla de fondo

**Se reparte por área vertical, no por capa.**

Nada de "uno backend y otro frontend". Cualquier funcionalidad toca modelo, ruta y pantalla; partirla por capa garantiza que los dos abramos los mismos archivos. Cada quien toma un área completa, del esquema a la UI.

---

## 3. El reparto

Salió de medir el trabajo previo de cada uno por área, así que nadie parte de cero:

| Área | Dueño | Huella previa |
| --- | --- | --- |
| **A · Ventas y CRM** | Nosotros | 129 vs 51 |
| **B · Bodega y despacho** | **Sebastián** | 43 vs 23 |
| **C · Talleres** | **Sebastián** | 29 vs 21 |
| **D · Finanzas y facturación** | **Sebastián** | 116 vs 18 |
| **E · Permisos y RRHH** | Nosotros | 24 vs 12 |

Te quedan tres áreas y a nosotros dos, pero la carga real está pareja: **Talleres casi no tiene código que hacer todavía** (ver más abajo), así que en la práctica son dos activas por lado.

Facturación es tuya sin discusión: es tu módulo y tienes seis veces nuestra huella ahí.

---

## 4. Tus áreas, en concreto

### D · Finanzas y facturación

Lo que queda de la revisión de Christopher:

- **Datos tributarios antes de facturar** — el motor DTE ya valida receptor; falta probar el flujo desde una venta incompleta.
- **Boleta anónima** — el motor ya distingue boleta, pero Venta Sala sigue exigiendo cliente al crear. Es la que confirmaste con Felipe: no siempre hace falta cliente.
- **Máximo 20 ítems** — existe la utilidad de límite; falta la prueba de aceptación con 20 y 21 ítems.
- **Trazabilidad N° interno → guía → DTE** — falta el recorrido completo y un reporte de excepciones.
- **Cobranza:** alertas a 15, 5 y 0 días (no existen), bitácora de gestiones con compromiso de pago, y conciliación contra cartola.

Antes de programar las alertas hay que definir **el modelo de compromiso de pago**. Sin eso, las tres reglas no tienen sobre qué dispararse.

### B · Bodega y despacho

- **Físico, disponible, reservado y dañado** — hoy hay stock y un estado Reserva, pero no un modelo consistente. Es el más grande del área.
- **Kardex inalterable** — confirmar inmutabilidad con documento origen, usuario y hora.
- **OC sugerida por stock crítico** — no existe.
- **Código de barras obligatorio** — falta el bloqueo de recepción/despacho sin lectura.
- **Mermas y dañados** — falta el flujo con responsable, causa y efecto sobre disponible.
- **KPI de tiempos** OC → recepción → interno → despacho.
- **Despacho:** vista consolidada de estado por taller, cadena Patio/Didáctico/reparto/entregado, y validación de dirección completa según tipo de despacho.

Ojo con **ubicaciones**: hay 34.732 productos sin ubicación asignada. Eso no se resuelve programando — es carga de datos de Plastimar. Conviene que prepares la carga masiva y la pidas, en vez de esperar.

### C · Talleres (corte, confección, espuma)

**Acá te pido que no escribas código todavía**, y es a propósito.

Casi todas las brechas de espuma dependen de las recetas —material requerido por OT, consumo, merma— y hoy hay **0 recetas cargadas sobre 37.162 productos**. Programar la explosión de materiales antes de que exista una sola receta es trabajo que no cierra ninguna ficha y que habría que rehacer cuando lleguen los datos reales.

Lo mismo con la evidencia fotográfica en confección: hay 3 entradas de bitácora y 0 fotos. El problema no es que falte el campo, es que nadie lo usa.

Lo que sí se puede hacer ahora, sin depender de datos:

- Estados Pendiente / En proceso / Terminado con transición visible y aviso al siguiente eslabón.
- Cola de trabajo por taller con priorización por fecha comprometida.
- Aviso de término a bodega/despacho.
- Rechazo y retrabajo como estado con causa.

Los tres primeros son, en el fondo, el mismo problema: **la coordinación por WhatsApp que aparece en las tres fichas de taller**.

---

## 5. Lo nuestro — no lo toques sin avisar

- **A · Ventas y CRM**: grafías de tipo de venta, Trato Directo, referencia de Marketplace, adjudicación parcial, versionado de cotización.
- **E · Permisos y RRHH**: catálogo de permisos por función, `rbac`, usuarios, vínculo con RRHH.

Si necesitas algo de estas áreas para avanzar en la tuya, **pídelo**; no lo hagas de paso. Es exactamente así como aparecieron las dos fichas de cliente en paralelo.

---

## 6. Los transversales: de a uno, y en este orden

Hay dos trabajos que atraviesan **todas** las áreas y no se pueden repartir:

**1º · Flujo único de estados de venta → tuyo.**
Ya escribiste `estados-normalize.js`, que es la base de esto. Aparece como brecha en gerencia, cobranza, bodega, despacho y los tres talleres a la vez. Mientras esté en curso, **nadie más toca estados**.

**2º · Motor de alertas con escalamiento → nuestro, y después del anterior.**
Las alertas se disparan sobre transiciones de estado. Construirlas antes de que el flujo esté unificado significa cablearlas contra estados que van a cambiar.

El orden no es negociable por dependencia técnica, pero sí lo es quién toma cuál. Si prefieres el motor de alertas, lo cambiamos.

---

## 7. Archivos compartidos: protocolo

Hay archivos que ningún reparto evita.

**`schema.prisma` y migraciones**

- Avisar antes de crear una migración.
- Nombre con iniciales: `20260828_SR_add_campo` / `20260828_CX_add_campo`. Evita el choque de timestamp.
- Después de un `pull` que traiga migraciones ajenas, correr `prisma migrate dev` antes de seguir. Si no, tu próxima migración se genera contra un esquema viejo.
- No editar el modelo de otra área "de paso".

**`permissions.js` + `rbac.js` + `usuarios/index.js`**

Son del área E. **Sólo su dueño los edita.** Están duplicados en front y back: cambiar uno sin el otro deja el sistema incoherente, y los dos los tocamos esta semana.

**`TopBar.jsx`**

Sólo agregar líneas al final del grupo que corresponda. No reordenar ni reestructurar sin avisar.

**Rutas grandes** (`ventas/create.js`, `ventas/update.js`, `crm/index.js`, `clientes/*`, `CrmPage.jsx`)

Cabe trabajo de varias áreas. Cambio acotado a lo tuyo, commit propio y separado.

---

## 8. Ramas

Lo que más daño hizo.

1. Cada uno en su rama, nombrada por área: `area-b-bodega`, `area-d-finanzas`.
2. **Nadie cambia la rama del árbol del otro.** Si necesitas otra rama en paralelo, `git worktree` — no toca el checkout ajeno.
3. **Nada sin commitear al terminar el día.** Si quedó a medias, un `wip:` en tu rama.
4. Ramas cortas, integrando a `main` seguido. Una rama de tres días es conflicto asegurado.
5. Al empezar: `git fetch && git log --oneline origin/main -5`.
6. Borrar la rama al terminar. Hoy hay **15 ramas**, casi todas muertas.

---

## 9. Lo que no es código

Buena parte de lo que falta **no se resuelve programando**, y conviene pedirlo ya porque es lo que más brechas cierra por peso:

- Cargar las recetas — hoy 0 sobre 37.162 productos. Bloquea casi toda el área de espuma.
- Asignar ubicación a 34.732 productos. Bloquea picking y código de barras.
- Definir el flujo de estados. Bloquea el transversal 1.
- Las reglas de descuento con Paulina. El módulo hoy rechaza todo descuento.

---

## 10. Lo mínimo

Si de todo esto sólo sobrevive una parte:

1. Cada uno en su rama; nadie cambia la del otro.
2. Nada sin commitear al terminar.
3. `schema.prisma` y los permisos tienen dueño único.
4. Los transversales van de a uno.

---

## Anexo — Hallazgos en tus áreas (28-08-2026)

Cosas que encontré trabajando en lo mío y que caen en tu lado. No las toqué.

**Test rojo en facturación.** `test/facturacion-routes.test.js` falla en *"rechaza reanudar un CAF de certificación anterior a la resolución vigente"*. Verificado que **no es mío**: falla igual con el árbol limpio en `main`.

**El mojibake está vivo en `orden_compra_online`.** 2.635 filas con `tipo_cotizacion = 'Mercado PÃºblico'`, más varias en `canal` (`'Ya habÃ­a comprado antes'`, `'RecomendaciÃ³n de un conocido'`). Es el canal de Compra Ágil, así que afecta a cualquier filtro sobre esa tabla.

**Para el flujo único de estados, que es tuyo:** el catálogo de tipos de venta ahora vive en `backend/src/routes/ventas/estados-normalize.js`, con `normalizeTipoVenta`, `tipoVentaFromSlug` y `grafiasDeTipoVenta`. Conviene que los estados sigan el mismo patrón para no volver a tener dos vocabularios.
