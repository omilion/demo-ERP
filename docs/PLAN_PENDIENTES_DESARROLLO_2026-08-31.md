# Los 10 pendientes de desarrollo — reparto

31-08-2026. Continuación de [REPARTO_AREAS_SEBASTIAN.md](REPARTO_AREAS_SEBASTIAN.md); el protocolo de ramas, migraciones y archivos compartidos sigue vigente tal cual y no se repite acá.

Son los pendientes que **no dependen de Plastimar**. Todo lo que está esperando datos (ubicaciones, códigos de barra, usuarios reales, operarios en ODT) queda fuera de este documento a propósito: no es trabajo nuestro y mezclarlo confunde la carga real.

---

## 1. Por qué este reparto corrige al anterior

El reparto de áreas se hizo midiendo la huella previa de cada uno, y justificaba darte tres áreas con una frase explícita: *"Talleres casi no tiene código que hacer todavía"*.

**Esa premisa ya no se sostiene.** De estos diez pendientes, tres son de Talleres, y en la última semana nosotros construimos ahí el módulo de costeo completo: recetas, tarifas, `PanelCobertura`, `EditorRecetaModal` y el importador del Excel de MK. La huella se dio vuelta.

Si aplicáramos el reparto por área tal como está escrito, te tocarían **8 de 10**. No es que el reparto estuviera mal: cambió lo que hay debajo.

**Propuesta: el área C (Talleres) pasa a nosotros.** El resto queda igual.

| Área | Antes | Ahora |
| --- | --- | --- |
| A · Ventas y CRM | Nosotros | Nosotros |
| B · Bodega y despacho | Sebastián | Sebastián |
| **C · Talleres** | **Sebastián** | **Nosotros** |
| D · Finanzas y facturación | Sebastián | Sebastián |
| E · Permisos y RRHH | Nosotros | Nosotros |

Si prefieres conservar Talleres, cambiamos otra cosa — pero entonces hay que mover tres puntos para el otro lado, porque tal como está no queda parejo.

---

## 2. El reparto

### Tuyo — Sebastián

| # | Trabajo | Tamaño | Área |
| --- | --- | --- | --- |
| 1 | **Estado formal Created→Closed**, con persistencia y transiciones autorizadas | Grande | Transversal |
| 7 | **Trigger de BD para kardex inalterable** | Chico | B |
| 8 | **Escaneo obligatorio de código de barras** en recepción y despacho | Medio | B |
| 9 | **Normalizar grafías de cobranza histórica** | Chico | D |
| 10 | **Cadena única Patio→Didáctico→Reparto** | Medio-grande | B |

### Nuestro

| # | Trabajo | Tamaño | Área |
| --- | --- | --- | --- |
| 2 | **Trabajo interno de taller sin venta** + centro de costo | Medio | C |
| 3 | **Objetar y devolver OT** con observación | Chico-medio | C |
| 4 | **Densidad, lote, calidad y merma** de Espuma | Medio | C |
| 5 | **F30, pensiones y baja automática de accesos** | Medio | E |
| 6 | **Catálogo de excepciones y alertas escaladas** | Grande | Transversal |

Cinco y cinco, y con el peso repartido: cada lado carga un "grande", y los dos chicos quedan de tu lado para compensar que el punto 1 es el más pesado de los diez.

---

## 3. Detalle de lo tuyo

### 1 · Estado formal Created→Closed

Ya era tuyo como transversal en el reparto anterior, y sigue siendo el trabajo más importante de la lista: aparece como brecha en gerencia, cobranza, bodega, despacho y los tres talleres a la vez.

Hoy `deriveEstadoFlujo` **calcula** el estado desde pago, entrega y anulación. Está sólo en dos archivos —`ventas/estados-normalize.js` y `matriz-ventas/index.js`—, así que la superficie es chica; lo grande es lo que hay que construir: tabla de transiciones, persistencia, autorización por rol y registro de quién movió qué.

**Mientras esto esté en curso, nadie más toca estados.** Avísanos cuando partas.

### 7 · Trigger de kardex

La API de `MovimientoBodega` ya es append-only, pero un `UPDATE` o `DELETE` directo contra la base pasa sin resistencia.

Ojo con un detalle: **no hay ningún trigger en las 86 migraciones actuales**. Vas a estrenar el patrón, así que conviene que la migración quede bien comentada para los que vengan después.

### 8 · Escaneo obligatorio de código de barras

La validación de formato existe; falta la obligatoriedad en los dos puntos donde importa: recepción de OC y despacho.

**Se puede construir ahora, pero no se puede exigir todavía**: hay 34.442 productos sin código y 49 grupos duplicados. Sugerencia: constrúyelo detrás de un interruptor de configuración, apagado por defecto, y que Plastimar lo encienda cuando termine de cargar. Si lo dejas obligatorio de entrada, bloqueas la operación el día que se despliegue.

### 9 · Normalizar grafías de cobranza

Más chico de lo que parece. Medido en producción hoy:

```
CANCELADA  3339      nula          2
NULA        536      cancelada     1
PENDIENTE   106      caNCELADA     1
(vacío)       6      rechazada     1
                     canCELADA     1
```

Son **12 filas sucias de 3.993**. El patrón ya está resuelto: mismo enfoque que usamos en `estados-normalize.js` para los tipos de venta —catálogo central de grafías, migración de normalización, y que la escritura nueva use el catálogo—. Cópialo de ahí.

### 10 · Cadena Patio→Didáctico→Reparto

Hay tracking, pero no una cadena obligatoria que conecte talleres, patio y reparto.

Depende del punto 1: la cadena son transiciones de estado. Hazlo después, o de la mano, ya que ambos son tuyos.

---

## 4. Detalle de lo nuestro

**2 · Trabajo interno sin venta + centro de costo.** `TallerFormPage.jsx:256` exige `ordenId` como obligatorio, así que hoy no se puede abrir una OT que no venga de una venta. Falta hacerlo opcional y crear el modelo de centro de costo, que no existe en el schema.

**3 · Objetar y devolver OT.** La supervisora devuelve la OT a la vendedora con una observación. La infraestructura de notificaciones ya está construida, así que es sobre todo un estado nuevo y su vista.

**4 · Densidad, lote, calidad y merma de Espuma.** **Bloqueado**: no hay campos ni reglas, y las reglas las tiene que definir Gerencia. Lo dejamos listado pero no lo arrancamos hasta tener respuesta. Ver sección 6.

**5 · F30, pensiones y baja de accesos.** Menos trabajo del que sugiere el título: `Trabajador` ya tiene `afp`, `salud`, `cargo`, `sueldoBase` y `sueldoLiquido`, y el modelo `Liquidacion` existe. Es principalmente un reporte sobre datos que ya están, más un enganche que desactive la cuenta ERP al terminar el contrato.

**6 · Catálogo de excepciones y alertas escaladas.** Era nuestro transversal desde el reparto anterior, y **va después del punto 1**: las alertas se disparan sobre transiciones de estado, y cablearlas contra estados que van a cambiar es trabajo perdido.

---

## 5. Orden y dependencias

Sólo hay una dependencia dura entre ambos lados: **nuestro punto 6 necesita tu punto 1 terminado.**

```
Sebastián    1 ────────────────► 10
                    │
Nosotros     2, 3, 5 ──────────► 6
             (4 bloqueado)
```

Mientras construyes el flujo de estados, nosotros avanzamos 2, 3 y 5, que no lo tocan. Cuando cierres el 1, nosotros entramos al 6 y tú sigues con 10. Los puntos 7, 8 y 9 son independientes y los puedes intercalar cuando quieras.

Lo importante: **avísanos cuando el punto 1 esté cerrado**, porque es lo que nos destraba.

---

## 6. Lo que hay que pedir antes de programar

Dos cosas de esta lista no se resuelven con código, y conviene pedirlas ya:

- **Reglas de Espuma** (punto 4) — Gerencia tiene que definir qué se registra de densidad, lote y calidad, y cómo se calcula la merma. Sin eso no hay qué construir.
- **Carga de códigos de barra** (punto 8) — 34.442 productos sin código. Se puede construir sin esto, pero no encender.

---

## 7. Antes que todo lo anterior: una regla de prueba en producción

Encontramos esto hoy y **es nuestro**, así que lo tomamos nosotros de inmediato:

```
nombre     TEST-DESC-RULE-1786544157130 regla
condicion  tipo "Normal" + categoría "Sillas"
efecto     10% autoaprobado, requiere_aprobacion = FALSE
prioridad  500
creada     12-08-2026
```

Es una regla que dejó un test y quedó activa en la base productiva. Cualquier venta Normal de una silla se lleva 10% de descuento **sin pasar por aprobación de nadie**. Sale hoy.

---

## 8. Nota sobre tu auditoría

Tu punto 8 marcaba *"OC sugerida y KPI de tiempos — sin datos para KPI"*, con dueño Plastimar. **Era código, no datos**: `/api/ordenes-compra-proveedores/metricas/tiempos` devolvía 404 porque un despliegue manual nuestro, hecho desde una rama que estaba atrasada respecto de `main`, dejó `metricas.js` en el disco pero con un `index.js` viejo que no lo registraba.

Ya está corregido y la ruta responde. El error fue nuestro y el detalle está en la sección 9.

Vale la pena que revises si algún otro de tus "bloqueado por datos" tiene la misma causa. Nosotros verificamos los principales —cobranza, cartola, consumos de ODT, bitácora, RRHH, ubicaciones, costeo— y todos están montados y respondiendo.

---

## 9. Una cosa que cambiamos en el protocolo

Al despliegue manual le faltaba una verificación, y por eso pisamos tu trabajo. Queda como regla:

**Antes de desplegar, comprobar las dos direcciones, no sólo una.**

```bash
git rev-list --count HEAD..origin/main   # atrás  → si no es 0, NO desplegar
git rev-list --count origin/main..HEAD   # adelante
```

Estar adelante de `main` es normal. **Estar atrás y desplegar revierte el trabajo del otro**, y lo hace en silencio: `tar -xf` es aditivo, así que los archivos que sólo existen en `main` sobreviven y los que están en ambas ramas se sobrescriben con la versión vieja. Queda un servidor que no corresponde a ninguna rama.

En lo posible, desplegar por el pipeline —`push` a `main`— que usa `rsync --delete` y deja el servidor idéntico al origen.

Y un detalle que costó un rato: **después de fusionar cambios de `schema.prisma`, correr `npx prisma generate` antes de los tests.** El cliente queda viejo y el síntoma es un 500 opaco, no un error de compilación.
