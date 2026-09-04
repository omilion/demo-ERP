# Sebastián — tus cinco pendientes de desarrollo

31-08-2026. Documento autocontenido: acá está sólo lo tuyo. El protocolo de ramas, migraciones y archivos compartidos de [REPARTO_AREAS_SEBASTIAN.md](REPARTO_AREAS_SEBASTIAN.md) sigue vigente igual.

Sólo entra trabajo que **no depende de Plastimar**. Todo lo que está esperando datos —ubicaciones, códigos de barra, usuarios reales, operarios en ODT— queda afuera a propósito.

---

> ## ⚠ Dependencia dura: te estamos esperando
>
> **Nuestro punto 6 (catálogo de excepciones y alertas escaladas) no puede empezar hasta que cierres tu punto 1 (estado formal Created→Closed).**
>
> Las alertas se disparan sobre transiciones de estado. Si las construimos antes de que el flujo esté unificado, quedan cableadas contra estados que van a cambiar, y hay que rehacerlas enteras.
>
> **Es la única dependencia entre ambos lados en toda la lista.** Por eso el punto 1 va primero de todo lo tuyo, aunque sea el más pesado.
>
> **Avísanos apenas lo cierres** — es lo que nos destraba. Mientras tanto avanzamos en cosas que no tocan estados.

---

## El reparto, en una línea

Cinco pendientes por lado. Los diez completos están en [PLAN_PENDIENTES_DESARROLLO_2026-08-31.md](PLAN_PENDIENTES_DESARROLLO_2026-08-31.md).

**Un cambio que te afecta y que conviene que veas:** proponemos que **Talleres (área C) pase a nosotros**. El reparto anterior te daba tres áreas justificándolo con una frase textual —*"Talleres casi no tiene código que hacer todavía"*— y eso ya no es cierto: tres de estos diez pendientes son de Talleres, y esta semana construimos ahí el módulo de costeo completo. Con el reparto literal te tocaban **8 de 10**.

Si prefieres conservar Talleres, lo conversamos, pero entonces hay que mover tres puntos para el otro lado.

---

## 1 · Estado formal Created→Closed

**Grande · transversal · va primero**

Ya era tuyo como transversal en el reparto anterior. Es el trabajo más importante de los diez: aparece como brecha en gerencia, cobranza, bodega, despacho y los tres talleres a la vez.

Hoy `deriveEstadoFlujo` **calcula** el estado desde pago, entrega y anulación. No hay máquina de estados ni auditoría: no se puede saber quién movió qué ni bloquear una transición inválida.

Lo bueno: la superficie actual es chica. Está sólo en dos archivos.

```
backend/src/routes/ventas/estados-normalize.js
backend/src/routes/matriz-ventas/index.js
```

Lo grande es lo que hay que construir sobre eso: tabla de transiciones permitidas, persistencia del estado, autorización por rol y registro de quién y cuándo.

**Mientras esté en curso, nadie más toca estados.** Avísanos cuando partas y cuando cierres.

---

## 2 · Cadena única Patio→Didáctico→Reparto

**Medio-grande · área B · después del 1, o de la mano**

Hay tracking y validaciones de despacho, pero no una cadena obligatoria que conecte talleres, patio y reparto.

Depende de tu punto 1: la cadena son transiciones de estado. Como ambos son tuyos, puedes encadenarlos sin coordinar con nadie.

---

## 3 · Escaneo obligatorio de código de barras

**Medio · área B · independiente**

La validación de formato ya existe. Falta la obligatoriedad en los dos puntos donde importa: recepción de OC y despacho.

**Se puede construir ahora, pero no se puede exigir todavía.** En producción hay **34.442 productos sin código** y **49 grupos duplicados**.

Sugerencia: constrúyelo detrás de un interruptor de configuración, **apagado por defecto**, y que Plastimar lo encienda cuando termine de cargar. Si queda obligatorio de entrada, el día que se despliegue se bloquea la operación de bodega.

---

## 4 · Trigger de BD para kardex inalterable

**Chico · área B · independiente**

La API de `MovimientoBodega` ya es append-only, pero un `UPDATE` o `DELETE` directo contra la base pasa sin resistencia.

Un detalle: **no hay ningún trigger en las 86 migraciones actuales.** Vas a estrenar el patrón en este repositorio, así que conviene dejar la migración bien comentada para quien venga después.

---

## 5 · Normalizar grafías de cobranza histórica

**Chico · área D · independiente**

Más chico de lo que suena. Medido en producción hoy, sobre `ventas.cobranza_historico`:

```
CANCELADA  3339      nula          2
NULA        536      cancelada     1
PENDIENTE   106      caNCELADA     1
(vacío)       6      rechazada     1
                     canCELADA     1
```

Son **12 filas sucias de 3.993**.

El patrón ya está resuelto y lo puedes copiar: mismo enfoque que usamos en `estados-normalize.js` para los tipos de venta — catálogo central de grafías, migración de normalización, y que toda escritura nueva pase por el catálogo.

---

## Orden sugerido

```
1 ──────────────────────► 2
(nos destraba a nosotros)

4, 5 (chicos, intercalables)     3 (cuando quieras; encender después)
```

Los puntos 3, 4 y 5 son independientes entre sí y del resto: intercálalos cuando necesites cortar con el punto 1, que es largo.

---

## Dos cosas nuestras que te tocan

### Un error nuestro que pisó tu trabajo

Tu auditoría marcaba *"OC sugerida y KPI de tiempos — sin datos para KPI"*, con dueño Plastimar. **Era código, no datos.**

`/api/ordenes-compra-proveedores/metricas/tiempos` devolvía **404 en producción**: un despliegue manual nuestro, hecho desde una rama que estaba **atrasada** respecto de `main`, dejó tu `metricas.js` en el disco pero con un `index.js` viejo que no lo registraba. Como `tar -xf` es aditivo, los archivos que sólo existían en `main` sobrevivieron y los que estaban en ambas ramas se sobrescribieron con la versión vieja — quedó un servidor que no correspondía a ninguna rama.

Ya está corregido: `main` y producción coinciden byte a byte, y la ruta responde.

Vale la pena que revises si algún otro de tus *"bloqueado por datos"* tiene la misma causa. Nosotros verificamos los principales —cobranza, cartola, consumos de ODT, bitácora, RRHH, ubicaciones y costeo— y **todos están montados y respondiendo**.

### La regla que agregamos al protocolo

Al despliegue manual le faltaba una verificación. Queda como regla para los dos:

```bash
git rev-list --count HEAD..origin/main   # atrás  → si no es 0, NO desplegar
git rev-list --count origin/main..HEAD   # adelante
```

Estar adelante de `main` es normal. **Estar atrás y desplegar revierte el trabajo del otro, y en silencio.**

En lo posible, desplegar por el pipeline —`push` a `main`—, que usa `rsync --delete` y deja el servidor idéntico al origen.

Y un detalle que nos costó un rato: **después de fusionar cambios de `schema.prisma`, correr `npx prisma generate` antes de los tests.** El cliente queda viejo y el síntoma es un 500 opaco, no un error de compilación.
