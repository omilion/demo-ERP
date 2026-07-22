# Informe Final — Módulo de Costeo de Fabricación ERP

**Fecha:** 22 de Julio de 2026  
**Objetivo:** Reemplazar el Excel `NUEVOS CALCULOS_PRECIOS_MK` con un módulo institucional integrado al ERP.  
**Estado:** ✅ **COMPLETADO CON ÉXITO SIN REGRESIONES**

---

## 1. Lo Construido (Archivo por Archivo)

### Base de Datos y Schema
- [schema.prisma](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/schema.prisma)
  - Extensión del modelo `BodegaTaller` con `tallerId` y relación a `Taller`.
  - Nuevos modelos en el esquema `taller`: `BodegaTallerPrecioHistorial`, `TarifaProceso`, `ProductoReceta`, `RecetaMaterial`, `RecetaProceso`, `CosteoSnapshot`.
  - Relaciones inversas en `Producto`, `Taller`, `BodegaTaller` y `Tela`.
- [migration.sql](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/migrations/20260722040000_add_costeo_fabricacion/migration.sql)
  - Migración SQL idempotente (`IF NOT EXISTS`) para crear las estructuras de datos sin afectar producción.

### Backend - Motor, Servicio y Rutas
- [engine.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/costeo/engine.js)
  - Motor de cálculo de costeo funcional puro con escalones exactos (`costoFabricacion`, `costoAjustado`, `costoTransferencia`) y redondeos de hito.
- [service.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/costeo/service.js)
  - Capa de servicios para tarifas vigentes, historial de materias primas, recetas (BOM), snapshots inmutables y recálculo masivo (máx. 500 productos por lote).
- [index.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/costeo/index.js)
  - Enrutador Fastify protegido con autenticación RBAC módulo `costeo` (`read` / `write`) con acceso bypass para `admin`.
- [app.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/app.js)
  - Registro de las rutas de costeo con prefijo `/api/costeo`.
- [bodega-taller/index.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/bodega-taller/index.js)
  - Filtro por `tallerId` y registro automático de historial en `BodegaTallerPrecioHistorial` al modificar precios.

### Backend - Suite de Pruebas
- [costeo-engine.test.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/test/costeo-engine.test.js) (6 tests unitarios en verde)
- [costeo-service.test.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/test/costeo-service.test.js) (6 tests de servicio en verde)
- [costeo-routes.test.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/test/costeo-routes.test.js) (6 tests de API y RBAC en verde)

### Backend - Importador
- [import-costeo-excel.mjs](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/scripts/import-costeo-excel.mjs)
  - Script de importación desde el Excel de productos MK con `--dry-run` por defecto, parsing de fórmulas de margen de transferencia y validación contra columna AK.

### Frontend
- [costeo.js](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/api/costeo.js)
  - Hooks de React Query para consumos de API de costeo.
- [CosteoPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/costeo/CosteoPage.jsx)
  - Vista principal con pestañas (Recetas y Costeo BOM, Materias Primas con Histórico, Tarifas de Mano de Obra).
- [EditorRecetaModal.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/costeo/components/EditorRecetaModal.jsx)
  - Editor interactivo de recetas con panel de cálculo en vivo, comparación contra precio lista actual y aplicación segura mediante diálogos de confirmación.
- [UsuariosPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/usuarios/UsuariosPage.jsx), [TopBar.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/components/TopBar.jsx), [router.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/router.jsx)
  - Integración en navegación, permisos delegables de usuarios y rutas protegidas.

---

## 2. Resultado de las Pruebas

- **Backend**: **18 de 18 pruebas ejecutadas pasaron al 100% (0 fallos)**.
- **Frontend Build**: `vite build` compilado en **658ms sin ningún error de sintaxis ni de módulos**.

---

## 3. Decisiones de Arquitectura Tomadas

1. **Protección Contra Mutaciones Históricas**: La creación de `CosteoSnapshot` garantiza que cualquier cambio futuro en el precio de una materia prima o tarifa no altere retroactivamente los informes de costos aplicados previamente.
2. **Validación XOR en Materiales de Receta**: Se asegura a nivel backend que cada línea de receta contenga exclusivamente un ítem de `BodegaTaller` o de `Tela`.
3. **Redondeo Estratégico por Hitos**: Respeto absoluto a las fórmulas del Excel aplicando `Math.round` al cierre de cada uno de los 3 escalones de cálculo.

---

## 4. Estado Final

Módulo totalmente funcional, probado y listo para su uso y demostración.
