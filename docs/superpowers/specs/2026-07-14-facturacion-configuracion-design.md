# Facturación Electrónica (DTE/SII) — Página Configuración — Diseño

Fecha: 2026-07-14
Estado: aprobado, pendiente de implementación
Depende de: `docs/superpowers/specs/2026-07-14-facturacion-dte-design.md` (backend, ya en
`main`) y `docs/superpowers/specs/2026-07-14-facturacion-frontend-design.md` (flujos 1-4,
ya en `main`)

## Contexto

El backend de facturación (`/api/facturacion/*`) y los 4 flujos de emisión (venta, NC/ND,
guía despacho, listado documentos) ya están en `main` y desplegados. Falta la única pieza
marcada "fuera de alcance" en la ronda anterior: la pantalla para configurar los datos del
emisor, subir el certificado digital `.p12` y cargar los CAF (folios). Sin esto, `Emitir
DTE` siempre falla — es el bloqueador real para emitir un documento de verdad.

Referencia de patrón: HM ERP (`D:\analytics\dashboard\src\views\FacturacionView.tsx`,
tabs `empresa` y `folios`) tiene una pantalla de configuración ya probada en producción
para el mismo motor DTE (comparten backend portado). Este diseño adapta esa UX al sistema
de componentes real de Plastimar (no se copia el CSS inline de HM ERP).

**Fuera de alcance esta ronda:** tabs de HM ERP que no aplican a Plastimar — `clientes` y
`productos` (Plastimar ya tiene sus propios módulos), `set` de pruebas (específico de la
certificación de HM ERP), `libros` IECV/RCOF (fuera de alcance desde el spec de backend).

## Backend — ya existe, sin cambios

Todos los endpoints que esta pantalla consume ya están implementados y testeados
(`backend/src/routes/facturacion/index.js`):
- `GET /api/facturacion/empresa` — devuelve `{ empresa, certificado }`, `certPass` nunca
  se incluye.
- `PUT /api/facturacion/empresa` — actualiza cualquier subconjunto de campos del emisor.
- `POST /api/facturacion/empresa/certificado` — multipart, campo `certificado` (archivo)
  + `password` opcional.
- `GET /api/facturacion/cafs` — lista con `disponibles` calculado.
- `POST /api/facturacion/cafs` — multipart, campo `caf` (XML) + `ambiente`.
- `DELETE /api/facturacion/cafs/:id`.

Todo bajo `writeAuth`/`readAuth` (recurso `facturacion`, hoy solo rol `admin` puede
`write` — ver nota RBAC en el spec de backend).

## Patrones existentes a seguir

- **Ruta y nav:** Plastimar es 1-ruta-1-página (no tabs-en-una-vista como HM ERP). Nueva
  ruta `/facturacion/configuracion` en `router.jsx` (`protect(<ConfiguracionPage/>, {
  module: 'facturacion' })`), nuevo item "Configuración" en el grupo "Facturación" de
  `TopBar.jsx` (junto a "Documentos Emitidos").
- **Formularios:** `FormPanel`, `FormField`, `Input`, `Select`, `FormDivider`, `useForm`
  de `frontend/src/components/forms/index.jsx` — mismo patrón que `FormCliente.jsx`. No
  se usa CSS inline `inputStyle`/`btnStyle` al estilo HM ERP.
- **Permisos:** `canWriteFacturacion = can(user, 'facturacion', 'write')`, igual que
  `ViewVentaPanel.jsx:489`. Oculta botones de Guardar/Subir/Borrar si es `false`
  (solo-lectura), no confía solo en que la API los rechace.
- **Tabla CAFs:** patrón `Table` de `components/shared` con columnas `{ key, label,
  render, align }`, igual que `DocumentosPage.jsx`.
- **API con TanStack Query:** extender `frontend/src/api/facturacion.js` con el mismo
  patrón que ya usan `useDocumentos`/`useCrearDocumento` ahí.
- **Notificaciones:** `toast` de `store/notif`, igual que el resto del frontend (no
  `window.alert`/`confirm` custom de HM ERP salvo para confirmar borrado de CAF, donde sí
  se usa `confirmDialog` del store de notif, patrón ya usado en `FormCliente.jsx`).

## Página `ConfiguracionPage.jsx`

`frontend/src/pages/facturacion/ConfiguracionPage.jsx`, nueva. Tres secciones apiladas
verticalmente en un solo `main.page`:

### Sección 1 — Datos del emisor

`FormPanel`-style (o `SectionCard` de `components/shared` ya que no hay modal/drawer,
es una página completa) con `FormField` + `Input`/`Select` para cada campo de `Empresa`:
`rut`, `razonSocial`, `giro`, `acteco`, `direccion`, `comuna`, `ciudad`, `rutEnvia`
(RUT del titular del certificado), `fchResol` (date input), `nroResol` (number),
`ambiente` (`Select` con opciones "Certificación" / "Producción"). Precargado con
`useEmpresa()`. Botón "Guardar cambios" (`useUpdateEmpresa()`), deshabilitado si
`!canWriteFacturacion` o `isPending`. Éxito → `toast.success` + invalida
`['facturacion', 'empresa']`.

### Sección 2 — Certificado digital

Badge de estado: verde+check si `certificado.cargado && certificado.valido` (muestra
`subject`, `rutTitular`, fecha de vencimiento `validTo`); ámbar si cargado pero inválido
(muestra `certificado.error`); rojo "Sin certificado cargado" si no. Input contraseña
(`type=password`, nunca precargado — el backend no la devuelve nunca) + selector de
archivo `.p12`/`.pfx` (`<input type="file">` oculto, trigger con `Btn`). Al seleccionar
archivo dispara `useUploadCertificado()` (multipart `FormData`: `certificado` + `password`
si se ingresó). Éxito → `toast.success`/`toast.warning` según `certificado.valido`,
invalida `['facturacion', 'empresa']`. Es el primer upload de archivo del frontend de
Plastimar — no hay componente compartido de file-input, se hace directo con
`<input type="file" hidden>` + click programático, patrón tomado de HM ERP.

### Sección 3 — Folios (CAF)

Bloque superior: texto explicativo ("Descárgalo en el Menú de Postulantes del SII —
certificación o producción según el ambiente configurado arriba") + botón "Subir CAF"
(`<input type="file" accept=".xml" hidden>` → `useUploadCaf()`, manda `ambiente` tomado
de `empresa.ambiente` actual). Tabla con `useCafs()`: columnas Documento (tipo DTE +
nombre), Rango (folioDesde–folioHasta), Siguiente folio, Disponibles (rojo si 0, verde si
>0), Ambiente, Borrar (`confirmDialog` → `useDeleteCaf()`). Sin `disponibles=0` no se
puede emitir ese tipo de documento — mensaje ya lo da el backend (`engine.js:165`), acá
solo se muestra el número.

## API frontend nueva

Extender `frontend/src/api/facturacion.js`:

```javascript
export const useEmpresa = () => useQuery({
  queryKey: ['facturacion', 'empresa'],
  queryFn: () => api.get('/facturacion/empresa').then(r => r.data),
})

export const useUpdateEmpresa = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/facturacion/empresa', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'empresa'] }),
  })
}

export const useUploadCertificado = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) => api.post('/facturacion/empresa/certificado', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'empresa'] }),
  })
}

export const useCafs = () => useQuery({
  queryKey: ['facturacion', 'cafs'],
  queryFn: () => api.get('/facturacion/cafs').then(r => r.data),
})

export const useUploadCaf = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) => api.post('/facturacion/cafs', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'cafs'] }),
  })
}

export const useDeleteCaf = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/facturacion/cafs/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'cafs'] }),
  })
}
```

## Seguridad

`certPass` nunca vuelve del backend en `GET /empresa` (ya lo filtra la ruta actual) — el
formulario de contraseña siempre arranca vacío, nunca se precarga ni se muestra en texto
plano tras guardar. El archivo `.p12` viaja por HTTPS (mismo canal que el resto del API,
ya detrás de auth JWT); no se cachea ni se loguea el contenido del certificado ni la
contraseña en el cliente (sin `console.log` de las respuestas de estos dos endpoints).

## Testing

Mismo criterio que el spec de frontend anterior: no hay convención de testing de
componentes React en este proyecto, no se introduce infraestructura nueva. Verificar
manualmente: cargar la página con empresa ya seedeada (rut `76.354.051-0`), editar y
guardar un campo, subir un CAF de certificación real y confirmar que aparece en la tabla
con folios disponibles, subir el certificado `.p12` real de Plastimar y confirmar que el
badge pasa a verde con el `subject` correcto. Los tests de backend ya existentes (11
archivos, 42/42) cubren cada endpoint que esta página consume.

## Fuera de alcance (recordatorio)

- Tabs `clientes`/`productos`/`set`/`libros` de HM ERP — no aplican a Plastimar.
- Rotación/eliminación del certificado ya cargado (solo reemplazo subiendo uno nuevo).
- Multi-empresa (sigue siendo singleton `id=1`, igual que hoy).
