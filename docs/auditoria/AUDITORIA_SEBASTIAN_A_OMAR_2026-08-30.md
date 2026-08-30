# Auditoría de Sebastián al lote de Omar

Fecha: 30-08-2026

Rama auditada: `origin/area-a-ventas` en `5f36457`
Base de comparación: `origin/main`

## Alcance y método

Se revisaron los nueve commits que la rama agrega sobre `main`: permisos por
función, IA, tablero, notificaciones, descuentos, scripts operativos y sus
pruebas. No se ejecutaron scripts con `--apply`, ni se modificaron datos ni la
rama auditada.

Validación realizada en un worktree aislado de la rama:

- Las 11 pruebas nuevas de Omar pasan: **117 pruebas, 11 archivos**.
- La suite completa reproduce **4 pruebas rojas**:
  `categorias.test.js` (1), `facturacion-engine.test.js` (2) y
  `facturacion-routes.test.js` (1).
- Se hicieron reproducciones con datos sintéticos para los dos hallazgos de
  permisos indicados abajo.

## Hallazgos

### [ALTA] `ai:read` habilita consultas de remuneraciones a cualquier rol

**Dónde:** `backend/src/routes/ai/chat.js` (`executeTool` y selección de
herramientas); `backend/src/routes/ai/tools/index.js`
(`consultar_planillas` y `runTool`); commits `4986b8e` y `ea9f6db`.

**Qué pasa:** el nuevo control acepta `can(user, 'ai', 'read')` y, si es
verdadero, entrega **todas** las herramientas de negocio. `runTool` no valida
el permiso funcional de cada herramienta. Entre ellas está
`consultar_planillas`, que devuelve nombre, empresa, sueldo base, haberes,
descuentos y líquido de cada trabajador.

**Cómo reproducirlo:** se ejecutó `executeTool('consultar_planillas', ...)` con
un usuario sintético de rol `solo_lectura` y `permisosExtra: { ai: ['read'] }`.
La respuesta devolvió la liquidación sintética completa, incluido líquido
`$900.000`. Ese rol no posee permiso `rrhh`.

**Por qué importa:** asignar el permiso genérico `ai:read` desde Accesos pasa a
ser una escalada de lectura a remuneraciones, caja, comisiones, ventas y otras
áreas, no sólo acceso al asistente.

**Sugerencia:** asociar cada herramienta a los permisos de dominio mínimos y
validarlos dentro de `runTool` (por ejemplo, `rrhh:read` para planillas y
`caja:read` para caja). `ai:read` debe habilitar el asistente, no saltarse el
RBAC de los datos que consulta.

### [ALTA] El modo `--crear` puede aprovisionar administradores activos con una contraseña conocida

**Dónde:** `backend/scripts/ajustar-permisos-personas.mjs:24-25, 37-38, 83-92`;
commit `ea9f6db`.

**Qué pasa:** con `--crear --apply`, el script crea cuentas activas. Dos de las
identidades creadas tienen rol `admin` y todas reciben el hash de la constante
`PASSWORD = 'plastimar2026'`. El script también acepta `--db=<url>` y no limita
el entorno donde puede ejecutarse.

**Cómo reproducirlo:** inspección directa del script: para una persona ausente,
las líneas 83-92 insertan el usuario activo con el hash de la constante; las
líneas 37-38 declaran las dos cuentas admin. No se ejecutó el modo de escritura
contra ninguna base.

**Por qué importa:** una ejecución accidental contra una base compartida deja
credenciales administrativas conocidas en el código fuente. Es un riesgo de
acceso no autorizado, aunque el modo requiera una bandera explícita.

**Sugerencia:** eliminar `--crear` del script de operación o exigir un entorno
de prueba explícito. Si se mantiene, generar contraseñas aleatorias de un solo
uso, forzar cambio al primer ingreso y requerir una confirmación adicional que
rechace bases no locales.

### [MEDIA] El script de permisos no detecta cambios de nivel dentro de una función

**Dónde:** `backend/scripts/ajustar-permisos-personas.mjs:98-114`; commit
`ea9f6db`.

**Qué pasa:** `cambiaExtra` compara sólo las claves de `permisos_extra`, no sus
valores. Si una persona ya tiene `facturacion.emitir: ['read']` y el catálogo
espera `['read', 'write']`, ambas representaciones se reducen a
`'facturacion.emitir'`; el script concluye que no hay cambio y no actualiza.

**Cómo reproducirlo:** con los objetos sintéticos anteriores, la misma
comparación del script produce:

```json
{"actual":"facturacion.emitir","esperado":"facturacion.emitir","cambiaExtra":false}
```

**Por qué importa:** la migración de permisos puede dejar a una persona sin una
capacidad prometida, o conservar un nivel que se intentaba retirar, mientras el
resumen dice que no había nada que cambiar.

**Sugerencia:** comparar el JSON normalizado completo (claves y listas de
niveles ordenadas), no sólo `Object.keys(...)`.

### [MEDIA] Las pruebas de “recorrido de persona” dan por hecha una tarea inválida

**Dónde:** `backend/test/personas-recorrido.test.js` (helpers `puede` y `pasa`);
commit `ea9f6db`.

**Qué pasa:** ambos helpers devuelven éxito cuando la respuesta es cualquier
estado distinto de `403`. Los POST se envían con `payload: {}`, por lo que un
`400` de validación, o incluso un `500`, cuenta como “puede hacer su trabajo”.

**Cómo reproducirlo:** con un token de `vendedor`,
`POST /api/ventas` y cuerpo vacío devuelve `400` con
`"Invalid input: expected array, received undefined"`. El helper lo evalúa como
`res.statusCode !== 403`, es decir, `true`.

**Por qué importa:** las pruebas sólo prueban parcialmente la guardia RBAC; no
demuestran el recorrido funcional que anuncian y pueden ocultar regresiones de
validación o errores internos.

**Sugerencia:** preparar datos mínimos válidos por caso y exigir el código de
éxito esperado (por ejemplo `201`/`200`). Para los casos que sólo verifican
autorización, nombrarlos y separarlos como pruebas de guardia.

### [BAJA] La afirmación “959 tests pasan” no coincide con la suite actual

**Dónde:** `docs/AUDITORIA_CRUZADA_2026-08-30.md`, Parte 1; commit `5f36457`.

**Qué pasa:** la suite completa de la rama informa cuatro pruebas fallidas. El
mismo documento las identifica después como heredadas del merge, por lo que no
se atribuyen a Omar, pero la afirmación general de todas las pruebas aprobadas
queda desactualizada.

**Cómo reproducirlo:** desde `backend/`, ejecutar `npm.cmd run test:docker`.
Falla una prueba de categorías, dos del motor de facturación y una de rutas de
facturación.

**Por qué importa:** el estado de calidad comunicado para integrar la rama es
más favorable que el resultado real; dificulta distinguir deuda existente de
regresiones nuevas.

**Sugerencia:** declarar “117 pruebas nuevas aprobadas; suite total con 4
fallas conocidas” hasta que los fixtures de facturación y categorías se
corrijan.

## Aspectos verificados sin observación

- Las pruebas nuevas de grafías, permisos, recorridos, notificaciones, tablero
  y casos de uso de ventas pasaron en el worktree aislado.
- Las correcciones de migraciones de Sebastián están incluidas en `main`; la
  rama auditada no agrega una migración nueva.
- Los scripts de Marketplace y descuentos no se ejecutaron contra datos reales
  durante esta auditoría.

## Veredicto

No recomiendo integrar el lote posterior de Omar tal como está mientras
`ai:read` pueda eludir los permisos de dominio y el script pueda crear
administradores con contraseña conocida. Los hallazgos medios deben resolverse
en el mismo ciclo para que la migración de permisos y sus pruebas sean
confiables.
