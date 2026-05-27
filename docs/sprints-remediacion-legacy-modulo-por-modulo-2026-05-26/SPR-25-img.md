# SPR-25-img - img

Prioridad: **P3 - soporte tecnico**  
Dominio: **Soporte / Assets / Infraestructura**  
Subagentes especialistas: **Hubble + Rawls**  
Estado: **Aprobado**

## Objetivo

Revisar la carpeta legacy `img` y decidir que assets deben migrarse, reemplazarse o quedar asociados a otros sprints funcionales.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/img.md`
- Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\img`
- Plataforma nueva:
  - `frontend/public`
  - `frontend/src/pages/bodega/BodegaPage.jsx`
  - `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`
  - `frontend/src/pages/ventas/VentasFormPage.jsx`
  - `backend/src/routes/uploads/index.js`
  - `backend/src/routes/productos/helpers.js`
  - `frontend/vite.config.js`

## Inventario legacy

| Asset | Uso legacy | Decision nueva |
| --- | --- | --- |
| `no_foto_chica.jpg` | Placeholder de producto sin foto | Migrado como placeholder publico. |
| `logo.png` | Login/menu e impresiones | Reemplazado por branding/configuracion `logoUrl`; no se copia fijo. |
| `logo_reportes.jpg` | Cabecera de PDFs legacy | Resolver en sprints de reportes/plantillas con `logoUrl`. |
| `membrete_licitacion.png` | Impresion/cotizacion licitacion | Pertenece a sprint de licitaciones/documentos. |
| `membrete_nota_venta.png` | Nota de venta legacy | Pertenece a sprint de venta/directa/web/documentos. |
| `banner_impresion2.jpg` | Ficha impresa de taller | Pertenece a sprints de taller/impresion. |
| `indicator.gif` | Loader de subida/espera | Reemplazado por estados React/botones deshabilitados. |
| `uno.png`, `dos.png`, `tres.png` | Iconos visuales de pasos/estados legacy | Reemplazados por UI moderna. |
| `victo_chico.png`, `victo_negro.jpg`, `reloj.jpg` | Iconos visuales en listas/fichas taller | Reemplazar por iconos/componentes en sprints taller. |
| `fondo.jpg`, `up.png` | Decoracion CSS legacy | No migrar; diseño nuevo no depende de estos fondos. |

## Como se mostraba en legacy

- No existia pantalla propia `img`.
- La carpeta funcionaba como repositorio transversal de assets para:
  - Login y menu.
  - PDFs y reportes.
  - Notas de venta/licitation.
  - Fichas de taller.
  - Placeholder de productos sin foto.
  - Loader de subida.

## Como se muestra hoy

- El frontend nuevo no usa la carpeta completa legacy.
- Branding corporativo se maneja por configuracion (`logoUrl`) y componentes React.
- Productos tienen campos estructurados `fotoUrl`, `fotoUrlGrande` y `fotosGaleria`.
- Las rutas de fotos `/uploads/...` se sirven desde backend usando `UPLOADS_DIR`.
- Vite proxya `/uploads` al backend en desarrollo.
- Produccion debe enrutar `/uploads` hacia backend o servir `UPLOADS_DIR` por nginx.

## Cambios implementados

- Se migro solo el placeholder legacy:
  - `frontend/public/legacy-img/no_foto_chica.jpg`
- Se agrego helper central:
  - `frontend/src/utils/assets.js`
- Se usa placeholder en:
  - `frontend/src/pages/bodega/BodegaPage.jsx`
  - `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`
  - `frontend/src/pages/ventas/VentasFormPage.jsx`
- Se agrego servidor de uploads:
  - `backend/src/routes/uploads/index.js`
  - Registro en `backend/src/app.js` bajo `/uploads`
  - Raiz configurable por `UPLOADS_DIR`
  - Proteccion contra path traversal
- Se agrego proxy dev:
  - `frontend/vite.config.js` proxya `/uploads`
- Se documento produccion:
  - `docs/deploy-produccion-2026-05-18.md` incluye `UPLOADS_DIR`, ejemplo nginx y smoke.
- Se agrego test:
  - `backend/test/uploads.test.js`
  - Incluido en `backend/package.json` `test:ci`

## Brechas detectadas y cierre

| Brecha | Estado | Resolucion |
| --- | --- | --- |
| Placeholder legacy sin equivalente real | Cerrada | Se migro `no_foto_chica.jpg` y se usa en vistas de productos. |
| Fotos reales `/uploads/...` sin servidor explicito | Cerrada | Backend sirve `/uploads` desde `UPLOADS_DIR`. |
| Fotos no visibles en dev por falta de proxy | Cerrada | Vite proxya `/uploads` al backend. |
| Produccion sin instruccion para `/uploads` | Cerrada | Deploy documenta nginx/UPLOADS_DIR y smoke. |
| Logos/membretes legacy | No se migra en este sprint | Se resuelve en sprints de impresion/documentos con configuracion moderna. |

## Validacion

- Pruebas focalizadas:
  - `npm.cmd test -- uploads.test.js productos-fotos.test.js backend-helpers.test.js --reporter=dot`
  - Resultado: **3 archivos / 9 tests OK**.
- Suite CI backend:
  - `npm.cmd run test:ci -- --reporter=dot`
  - Resultado: **16 archivos / 109 tests OK**.
- Frontend:
  - `npm.cmd run lint` OK.
  - `npm.cmd run build` OK.
  - Observacion: advertencia conocida de Vite por chunk mayor a 500 kB.
- Revision por subagentes:
  - Hubble: aprobado sin P0/P1.
  - Rawls: aprobado sin P0/P1.

## Riesgos residuales

- Para ver fotos reales en produccion, se debe migrar el contenido de fotos al directorio configurado en `UPLOADS_DIR` y validar un archivo real con `curl -I`.
- No se copian logos/membretes fijos del legacy porque deben depender de configuracion de empresa y plantillas nuevas, no de assets antiguos hardcodeados.

## Checklist de validacion final

- [x] Inventariar assets legacy.
- [x] Revisar referencias en pantallas legacy.
- [x] Revisar equivalentes nuevos.
- [x] Migrar solo asset funcional necesario.
- [x] Habilitar entrega de fotos migradas.
- [x] Agregar proxy dev para `/uploads`.
- [x] Documentar requisito de produccion.
- [x] Ejecutar pruebas focalizadas, CI backend, lint y build.
- [x] Obtener validacion final de subagentes.

## Resultado de ejecucion

- Implementacion realizada: si.
- Archivos modificados: backend, frontend, docs y test.
- Pruebas ejecutadas: focalizadas, `test:ci`, lint y build.
- Riesgos residuales: operativos y documentados.
- Validacion del lead: aprobado.
- Decision final: **SPR-25 aprobado.**
