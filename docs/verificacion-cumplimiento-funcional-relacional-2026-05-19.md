# Verificacion de cumplimiento funcional y relacional - 2026-05-19

Objetivo: verificar si el ERP nuevo conserva las funciones conocidas del ERP viejo, pero con la arquitectura relacional corregida: cliente canonico, producto canonico, orden, ODT/trabajo y trazabilidad operativa.

## Resultado ejecutivo

Estado general: avance bueno, pero aun no cumple al 100%.

El ERP nuevo ya cubre gran parte de los modulos legacy y las correcciones Prisma/API agregadas cierran el punto mas delicado de taller: ya no se deberian crear ventas sin cliente, ODTs nuevas sin orden, bitacoras nuevas sin ODT, materiales nuevos sin ODT ni items de taller sin asignacion.

Lo que falta para poder defender la entrega como completa es cerrar tres brechas:

1. trazabilidad de stock;
2. trazabilidad/validacion de caja contra venta/trabajo;
3. definicion final de despacho/guia contra orden versus ODT/trabajo.

## Validaciones ejecutadas

| Validacion | Resultado | Lectura |
|---|---:|---|
| `npx prisma validate` | OK | El schema Prisma actual es valido. |
| `npm run build` frontend | OK | El frontend compila. Queda solo warning de bundle grande, no bloqueante funcional. |
| Tests unitarios no DB: `data-integrity-audit`, `operational-utils`, `backend-helpers` | OK, 16 tests | Helpers y auditor de integridad basico pasan. |
| `node --check src/routes/relation-guards.js` | OK | Guardas relacionales sin error de sintaxis. |
| `npm test` backend completo | No concluyente | Falla por entorno local de test/DB/JWT/seed, no queda como prueba funcional valida. |

Detalle del bloqueo de test completo:

- Sin `JWT_ACCESS_SECRET`, Fastify JWT falla por configuracion.
- Con `JWT_ACCESS_SECRET`, persisten errores 401/500 y errores Prisma en tests que esperan usuarios, clientes, caja y ventas seed.
- No hay `docker-compose.yml` en `C:\tmp\plastimar-review`, por lo que no hay entorno DB local reproducible desde este repo.

Conclusion: para certificar backend completo falta un entorno de test reproducible con DB migrada y seed.

## Cumplimiento por area

| Area | Estado | Evidencia |
|---|---|---|
| Clientes canonicos | Cumple para nuevas ventas | `backend/src/routes/ventas/create.js` exige `clienteId` y valida que exista. Auditor revisa `ordenes.cliente_id_nulo` y `ordenes.cliente_id_huerfano`. |
| Ventas | Cumple base | `ventas` tiene CRUD, matriz, cargos, multas, anulacion/activacion, impresion y detalle con cliente/items/pagos/despachos/guias/cobranza. |
| Productos/catalogo | Cumple base | CRUD productos, historial precio, consulta precios, importacion y movimientos bodega. |
| ODT/trabajo | Cumple para nuevas ODT | `odts/create.js` exige `ordenId`. La migracion agrega constraint `odts_orden_id_required_new`. |
| Pasar a taller | Cumple para nuevas operaciones | `pasar-taller` exige `odtId`, producto existente y `tallerId` activo. Normaliza talleres como entidad (`taller.talleres`). |
| Tres talleres legacy | Cumple conceptualmente | Legacy `Confecciones`, `Espumas`, `Madera/Externo` quedan modelados como registros en `taller.talleres`, no como columnas. |
| Bitacora taller | Cumple para nuevas entradas | API exige `odtId` y bloquea ODT legacy sin orden. Constraint `bitacora_taller_odt_id_required_new`. |
| Materiales taller | Cumple parcial | Historial/materiales nuevos exigen `odtId`, pero falta cerrar consumo real de stock contra bodega/ODT. |
| Despachos/guias | Cumple parcial | Nuevas escrituras exigen `ordenId` o `nInterno` resoluble a orden. Falta decidir si tambien deben llevar `odtId`. |
| Caja | Cumple parcial | Turnos, movimientos, cierre e historico existen. Pero `ordenId` en movimientos es opcional y no se valida al escribir. |
| Cobranza | Cumple parcial | Historico consultable y venta muestra cobranza por `ordenId`, pero no hay flujo completo de escritura/validacion relacional nueva. |
| Proveedores/compras | Cumple parcial | Pagos proveedor, detalles e ingreso mercaderia existen. Hay riesgo de actualizacion de stock sin movimiento trazable en una ruta. |
| RRHH | Cumple base | Trabajadores, contratos, liquidaciones, anticipos, licencias, vacaciones, EPP, asistencias, jornadas y libros. |
| Admin/RBAC/auditoria | Cumple base | Roles/permisos, usuarios, accesos, auditoria e integridad. |
| IA/RAG | No cumple aun | `AiChat.jsx` declara explicitamente que el asistente IA no esta conectado al RAG. |

## Lo que ya quedo bien corregido

### 1. Orden nueva exige cliente

La creacion de venta exige `clienteId` y valida que exista. Esto evita heredar el problema legacy de cliente por texto/RUT/email.

### 2. ODT nueva exige orden

La creacion de ODT exige `ordenId`. Esto impide crear trabajos productivos aislados como pasaba en el legacy.

### 3. Operaciones de taller nuevas exigen ODT reconciliada

`resolveOdtForWrite` rechaza:

- `odtId` invalido;
- ODT inexistente;
- ODT legacy sin `ordenId`.

Esto aplica en:

- pasar a taller;
- bitacora taller;
- historial materiales;
- bitacora por ODT.

### 4. Auditor de integridad cubre los puntos principales

El auditor ya revisa:

- ordenes sin cliente;
- ordenes con cliente huerfano;
- ODTs sin orden;
- ODT items sin taller;
- bitacora sin ODT;
- materiales sin ODT;
- despacho/guia sin orden;
- items huerfanos;
- duplicados criticos;
- stock negativo;
- fechas anomalas.

## Brechas importantes

### P0 - Stock no tiene trazabilidad suficiente por trabajo

`bodega.movimientos` hoy guarda:

- `producto_id`;
- `tipo`;
- `cantidad`;
- `motivo`;
- `user_id`;
- `created_at`.

No guarda:

- `orden_id`;
- `odt_id`;
- `pago_proveedor_id`;
- `origen_tipo`;
- `origen_id`;
- documento/factura como FK.

Riesgo: se puede cambiar stock sin poder demostrar si fue compra, ajuste, consumo de taller, despacho o correccion manual.

Ademas, hay dos caminos distintos para ingreso de stock:

- `stock-ingresos/aplicar/:pagoId` suma stock y crea `movimientoBodega`;
- `pagos-proveedores` con `ingresaStock` suma stock, pero no crea `movimientoBodega`.

Esto es el gap mas importante para cumplir de forma seria.

### P0 - Caja permite `ordenId` opcional sin validacion de existencia

`caja/movimientos.js` permite crear movimiento con `ordenId`, pero no valida que la orden exista.

El auditor detecta despues los `orden_id` huerfanos, pero la API aun no bloquea ese error al escribir.

Regla recomendada:

- ingreso de caja asociado a venta: `ordenId` obligatorio y valido;
- egreso/gasto operativo: `gastoTipoId` o referencia obligatoria;
- movimiento manual excepcional: motivo/referencia obligatoria y auditable.

### P1 - Despacho y guia estan unidos a orden, no a trabajo

Hoy el flujo queda:

`orden -> despacho/guia`

Eso puede ser correcto si el despacho siempre representa una venta completa. Pero si una orden puede generar varios trabajos/ODTs, y el cliente exige trazabilidad por trabajo, entonces falta:

- `odt_id` en `bodega.despachos`;
- `odt_id` en `bodega.guias_despachos`;
- validacion: guia/despacho debe apuntar a una ODT de la misma orden.

Decision necesaria: confirmar si despacho se controla por venta completa o por trabajo/ODT.

### P1 - Cobranza historica esta consultable, pero no cerrada como flujo nuevo

`ventas.cobranza_historico` tiene `orden_id` opcional y rutas de lectura. Para una operacion nueva completa deberia quedar definido:

- si cobranza se gestiona desde venta/caja;
- si los pagos reales viven en caja y cobranza solo reporta;
- si nuevas gestiones de cobranza deben crear/actualizar registros con `ordenId` validado.

### P1 - Test backend completo no es reproducible aun

No basta con que el codigo compile. Para poder decir "cumple", necesitamos:

- DB local/staging levantable;
- migraciones aplicadas;
- seed de usuarios/clientes/productos/ordenes;
- variables JWT correctas;
- `npm test` pasando en limpio.

Hoy no hay prueba completa reproducible desde cero en este workspace.

### P2 - IA/RAG esta visible pero no implementada

El componente `AiChat` existe, pero dice explicitamente que el asistente IA esta pendiente. Si esto sigue comprometido, falta sprint completo de:

- embeddings;
- indice semantico;
- permisos por modulo;
- fuentes consultables;
- respuestas con citas/datos reales;
- auditoria de preguntas/respuestas.

## Prioridad recomendada para el siguiente sprint

### Sprint recomendado: Trazabilidad stock/caja/trabajo

Objetivo: cerrar la parte que todavia impide decir que el ERP nuevo es relacionalmente superior al legacy.

Alcance tecnico:

1. Agregar trazabilidad formal a `bodega.movimientos`:
   - `orden_id`;
   - `odt_id`;
   - `pago_proveedor_id`;
   - `origen_tipo`;
   - `origen_id`;
   - indices y FK `NOT VALID` para no romper legacy.

2. Unificar ingresos de stock:
   - todo aumento/disminucion de stock debe crear `bodega.movimientos`;
   - eliminar o corregir el camino de `pagos-proveedores` que suma stock sin registrar movimiento.

3. Validar caja al escribir:
   - si viene `ordenId`, debe existir;
   - si es ingreso por venta, debe tener `ordenId`;
   - si es egreso, debe tener gasto/referencia.

4. Resolver criterio despacho:
   - mantener despacho por `orden_id` si el negocio despacha venta completa;
   - agregar `odt_id` si el negocio despacha por trabajo.

5. Agregar auditorias nuevas:
   - stock movimientos sin origen;
   - stock movimientos con `odt_id` huerfano;
   - caja ingresos de venta sin orden;
   - caja orden huerfana al escribir;
   - guias/despachos sin ODT si se adopta trazabilidad por trabajo.

## Conclusión

Estamos en la misma direccion: conservar modulos y funciones conocidas, pero corregir la base.

El avance actual ya ordena ventas, clientes, ODT, talleres, bitacora y materiales. Lo que falta para cumplir con rigor no es "hacer mas pantallas", sino cerrar la trazabilidad de movimientos: stock, caja y despacho.

Ese debe ser el siguiente sprint antes de seguir agregando funciones nuevas.
