# SPR-33-precios - precios

Prioridad: **P2 - completar equivalencia**
Dominio: **Bodega / Inventario / Mantencion de precios**
Subagentes revisores: **Sagan + Peirce**
Estado: **Aprobado localmente con doble revision multiagente**
Deploy: **No deployado**

## Objetivo

Revisar y reparar el modulo legacy `precios` comparando sus busquedas, tabla, calculos, actualizacion de precios y exportaciones contra la plataforma nueva.

## Evidencia legacy revisada

- `precios\index.php`
- `precios\lista.php`
- `precios\actualizar_precio_bodega.php`
- `precios\actualizar.php`
- `precios\modificar.php`
- `precios\pasar_a_get.php`
- `precios\buscar_codigo_interno.php`
- `precios\buscar_codigobarra.php`
- `precios\buscar_id_marco.php`
- `precios\buscar_nombre.php`
- `precios\buscar_proveedor.php`
- `precios\buscar_categoria.php`
- `precios\lista_excel.php`
- `precios\lista_excel3.php`
- `precios\lista_pdf.php`

## Como se mostraba en legacy

| Area | Legacy |
|---|---|
| Pantalla principal | `Mantencion Precios` con accesos por Codigo barra, Codigo interno, ID Marco, Nombre producto, Proveedor y Categoria. |
| Tabla | Foto, Cod Interno, ID Marco, Cod Barra, Nombre, Categoria, Subcategoria, Precio Costo, Precio venta + IVA, Precio Conv. Marco, PrecioLicitacion, Proveedor. |
| Busqueda nombre | Buscaba por nombre y por version sin tildes. |
| Busqueda proveedor | Usaba `codigo_proveedor` legacy. |
| Edicion rapida | Campo inline de `precio1` que llamaba `actualizar_precio_bodega.php`. |
| Formulario editar | Nombre, codigos, categoria/subcategoria, precio costo, precio convenio marco, stock critico, stock, proveedor, detalle web y detalle licitacion. |
| Exportaciones | Excel y PDF de la lista filtrada. |

## Como queda hoy

| Funcion legacy | Estado nuevo | Detalle |
|---|---|---|
| Consulta por Codigo barra | **Resuelto** | `ConsultaPreciosPage` usa filtro dedicado `codigoBarra`; backend exacto case-insensitive. |
| Consulta por Codigo interno | **Resuelto** | Filtro dedicado `codigoInterno`. |
| Consulta por ID Marco | **Resuelto** | Filtro dedicado `idMarco`. |
| Consulta por Nombre sin tildes | **Corregido SPR-33** | Backend filtra `nombre` con normalizacion sin diacriticos. |
| Consulta por Proveedor legacy | **Corregido SPR-33** | `proveedorId` tambien encuentra productos legacy con `producto.proveedor` por codigo, nombre o razon social. |
| Consulta por Categoria/Subcategoria | **Resuelto** | Selects dependientes en la UI nueva. |
| Tabla de precios | **Corregido SPR-33** | `ConsultaPreciosPage` muestra foto, codigos, ID Marco, nombre, categoria, subcategoria, proveedor, descuentos, precios calculados, convenio, licitacion y stock. |
| Precio Costo | **Corregido SPR-33** | Visible y editable solo para usuarios con permiso `bodega`. No se expone a vendedor. |
| Edicion rapida precio costo | **Corregido SPR-33** | Inline en `ConsultaPreciosPage`, protegido por `catalogo:write` + `bodega:write`; registra historial backend. |
| Formulario completo editar | **Resuelto** | `BodegaFormPage` cubre precio, convenio, stock, proveedor, textos web/lic, web e imagenes. |
| Excel | **Corregido SPR-33** | Export CSV compatible Excel desde Consulta Precios con columnas y calculos legacy. |
| PDF | **Reemplazo operativo** | Boton `PDF/Imprimir` usa impresion del navegador para guardar PDF. No se agrego generador PDF server-side porque el stack actual no tiene libreria PDF y el sistema nuevo ya usa print-to-PDF en otros modulos. |
| Auditoria precio | **Corregido SPR-33** | El historial de precios solo se crea desde transacciones reales de cambio de `precioLista`; se elimino POST cliente arbitrario. |
| Soft delete/reactivar por update | **Corregido SPR-33** | `PUT /productos/:id` ya no acepta `activo` y solo modifica productos activos. |
| Catalogo web publico | **Corregido SPR-33** | No devuelve `precioLista`; solo precio publico `precioWeb` o `null`. |
| Crear con campos sensibles | **Corregido SPR-33** | `POST /productos` exige `bodega:write` si el payload toca stock, precios, proveedor o visibilidad web. |

## Implementacion realizada

- `ConsultaPreciosPage`:
  - Agrego columna `Precio Costo` solo con `bodega:read`.
  - Agrego edicion rapida de precio solo con `catalogo:write` + `bodega:write`.
  - Agrego botones `Exportar Excel` y `PDF/Imprimir`.
- `reportes/export/productos`:
  - Exporta calculos legacy reales: `Precio venta + IVA`, `Precio Conv. Marco`, `PrecioLicitacion`.
  - Respeta filtros de Consulta Precios.
  - Incluye proveedor legacy por `codigoProveedor`, nombre o razon social.
- `productos/list`:
  - Busqueda por nombre con normalizacion sin tildes.
  - Filtro por proveedor compatible con productos migrados sin `proveedorId`.
  - Oculta `precioLista` a usuarios sin `bodega:read`.
- `productos/get` y `productos/autocomplete`:
  - Ocultan `precioLista` a usuarios sin `bodega:read`.
- `productos/publicWeb`:
  - No expone `precioLista` en catalogo publico.
- `ventas`:
  - Usa `consultaPrecios.precioNormalSalaVentaIva` como precio comercial cuando `precioLista` no viene expuesto.
- Seguridad/auditoria:
  - Se retiro `activo` del update general.
  - Se elimino el POST cliente de historial de precios.
  - Historial de precios queda protegido por `bodega:read`.
  - Creacion con campos sensibles queda protegida por `bodega:write`.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm.cmd exec vitest run productos.test.js --reporter=dot` | OK, 23/23 tests. |
| `npm.cmd run lint` en frontend | OK. |
| `npm.cmd run build` en frontend | OK. |
| `npm.cmd run test:full -- --reporter=dot` en backend | OK, 44/44 archivos, 399/399 tests. |

## Riesgos residuales

- La exportacion PDF server-side exacta del legacy no se implementa; se reemplaza por impresion/guardar como PDF desde navegador. Si el cliente exige archivo PDF generado por backend, debe entrar como mejora tecnica especifica.
- La busqueda sin tildes se resuelve en memoria sobre hasta 5000 productos para el filtro dedicado por nombre. Es suficiente para el volumen actual; si el catalogo crece mucho conviene agregar columna normalizada o extension `unaccent`.
- No deployado: falta publicar estos cambios en el ambiente real.

## Checklist de validacion final

- [x] Revisar archivos legacy principales.
- [x] Comparar campos, filtros, columnas y acciones.
- [x] Corregir export Excel/calculos de precios.
- [x] Corregir busqueda nombre sin tildes.
- [x] Corregir proveedor legacy sin `proveedorId`.
- [x] Corregir exposicion de costo por permisos.
- [x] Corregir integridad de historial y `activo`.
- [x] Agregar pruebas backend.
- [x] Validar frontend lint/build.
- [x] Validar backend completo.
- [x] Recibir aprobacion final de subagentes despues de los fixes P1.
- [x] Validacion final del lead local.

## Resultado de ejecucion

- Implementacion realizada: **Si**.
- Archivos modificados principales:
  - `backend/src/routes/productos/list.js`
  - `backend/src/routes/productos/get.js`
  - `backend/src/routes/productos/autocomplete.js`
  - `backend/src/routes/productos/update.js`
  - `backend/src/routes/productos/historial.js`
  - `backend/src/routes/productos/publicWeb.js`
  - `backend/src/routes/productos/create.js`
  - `backend/src/routes/productos/helpers.js`
  - `backend/src/routes/reportes/index.js`
  - `backend/test/productos.test.js`
  - `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`
  - `frontend/src/pages/ventas/VentasFormPage.jsx`
- Pruebas ejecutadas: **OK**.
- Validacion del lead: **Aprobado localmente**.
- Revision multiagente: **Sagan y Peirce aprobaron sin P0/P1 restantes**.
- Decision final: **SPR-33 aprobado localmente. Continuar con SPR-34.**
