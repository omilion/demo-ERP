import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Shell } from './components/Shell'
import { LicitacionesLegacyRedirect, OdtLegacyRedirect, PasarTallerLegacyRedirect } from './components/LegacyRedirects'
import LoginPage from './pages/login/LoginPage'
import DashboardPage, { DashboardOperativoPage } from './pages/dashboard/DashboardPage'
import MatrizVentasPage from './pages/matriz-ventas/MatrizVentasPage'
import VentaDetallePage from './pages/ventas/VentaDetallePage'
import VentasFormPage from './pages/ventas/VentasFormPage'
import VentaPrintPage from './pages/ventas/VentaPrintPage'
import AsistentePage from './pages/asistente/AsistentePage'
import BodegaPage from './pages/bodega/BodegaPage'
import BodegaFormPage from './pages/bodega/BodegaFormPage'
import PanelPickingPage from './pages/bodega/PanelPickingPage'
import PanelPackingPage from './pages/bodega/PanelPackingPage'
import TallerPage from './pages/taller/TallerPage'
import TallerFormPage from './pages/taller/TallerFormPage'
import TallerOperarioPage from './pages/taller/TallerOperarioPage'
import TallerCortePage from './pages/taller/TallerCortePage'
import CajaPage from './pages/caja/CajaPage'
import CajaFormPage from './pages/caja/CajaFormPage'
import ClientesPage from './pages/clientes/ClientesPage'
import ClienteDetallePage from './pages/clientes/ClienteDetallePage'
import ClientesFormPage from './pages/clientes/ClientesFormPage'
import CobranzaPage from './pages/cobranza/CobranzaPage'
import LicitacionDetallePage from './pages/licitaciones/LicitacionDetallePage'
import LicitacionFichaPage from './pages/licitaciones/LicitacionFichaPage'
import OrdenesCompraPage from './pages/ordenes-compra/OrdenesCompraPage'
import OrdenCompraDetallePage from './pages/ordenes-compra/OrdenCompraDetallePage'
import PagosProveedoresPage from './pages/pagos-proveedores/PagosProveedoresPage'
import PagoProveedorDetallePage from './pages/pagos-proveedores/PagoProveedorDetallePage'
import TelasPage from './pages/telas/TelasPage'
import TelaDetallePage from './pages/telas/TelaDetallePage'
import BodegaTallerPage from './pages/bodega-taller/BodegaTallerPage'
import DescuentosPage from './pages/descuentos/DescuentosPage'
import ProveedoresPage from './pages/proveedores/ProveedoresPage'
import ProveedorDetallePage from './pages/proveedores/ProveedorDetallePage'
import CrmPage from './pages/crm/CrmPage'
import CrmGestionDetallePage from './pages/crm/CrmGestionDetallePage'
import ConfigPage from './pages/config/ConfigPage'
import DespachosPage from './pages/despachos/DespachosPage'
import GuiaPrintPage from './pages/despachos/GuiaPrintPage'
import GuiaFormPage from './pages/despachos/GuiaFormPage'
import DespachoFormPage from './pages/despachos/DespachoFormPage'
import DespachoPackingPage from './pages/despachos/DespachoPackingPage'
import PickingConfirmPage from './pages/despachos/PickingConfirmPage'
import DespachoTrackingPage from './pages/despachos/DespachoTrackingPage'
import BitacoraTallerPage from './pages/bitacora-taller/BitacoraTallerPage'
import HistorialMaterialesPage from './pages/historial-materiales/HistorialMaterialesPage'
import StockIngresosPage from './pages/stock-ingresos/StockIngresosPage'
import PasarTallerPage from './pages/pasar-taller/PasarTallerPage'
import ConsultaPreciosPage from './pages/consulta-precios/ConsultaPreciosPage'
import ReportesGerencialesPage from './pages/reportes-gerenciales/ReportesGerencialesPage'
import ReportesComisionesPage from './pages/reportes-comisiones/ReportesComisionesPage'
import ReportesMovimientosAnormalesPage from './pages/reportes-movimientos-anormales/ReportesMovimientosAnormalesPage'
import UsuariosPage from './pages/usuarios/UsuariosPage'
import UsuarioFormPage from './pages/usuarios/UsuarioFormPage'
import RrhhPage, { TrabajadorDetallePage } from './pages/rrhh/RrhhPage'
import TrabajadorFormPage from './pages/rrhh/TrabajadorFormPage'
import IntegridadPage from './pages/admin/IntegridadPage'
import AuditoriaPage from './pages/admin/AuditoriaPage'
import HistoricoPage from './pages/admin/HistoricoPage'
import SaneamientoLegacyPage from './pages/admin/SaneamientoLegacyPage'
import ComisionesPage from './pages/admin/ComisionesPage'
import IaBalancePage from './pages/admin/IaBalancePage'
import DocumentosPage from './pages/facturacion/DocumentosPage'
import ConfiguracionPage from './pages/facturacion/ConfiguracionPage'
import EmitirManualPage from './pages/facturacion/EmitirManualPage'
import EmitirFacturaCompraPage from './pages/facturacion/EmitirFacturaCompraPage'
import EmitirLiquidacionPage from './pages/facturacion/EmitirLiquidacionPage'
import EmitirExportacionPage from './pages/facturacion/EmitirExportacionPage'
import DocumentosRecibidosPage from './pages/facturacion/DocumentosRecibidosPage'
import CosteoPage from './pages/costeo/CosteoPage'
import MateriaPrimaFormPage from './pages/materias-primas/MateriaPrimaFormPage'
import ImportacionesPage from './pages/importaciones/ImportacionesPage'
import OrdenesCompraProveedoresPage from './pages/ordenes-compra-proveedores/OrdenesCompraProveedoresPage'
import ExcepcionesPage from './pages/admin/ExcepcionesPage'
import PilotFeedbackPage from './pages/admin/PilotFeedbackPage'
import AyudaPage from './pages/ayuda/AyudaPage'


// Tienen que estar TODOS los roles del rbac. Falta uno y ese rol queda en un
// bucle cerrado: entra a '/', falla el guardia, lo mandan a '/dashboard' -que
// cuelga de '/'- y vuelve a fallar. La pantalla queda en blanco, sin error.
// Asi quedo taller_operario cuando se creo el rol.
const ALL = ['admin', 'vendedor', 'coordinador_comercial', 'bodeguero', 'cajero', 'taller', 'taller_operario', 'rrhh', 'solo_lectura']

const protect = (element, props) => <ProtectedRoute {...props}>{element}</ProtectedRoute>

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute allowedRoles={ALL}>
        <Shell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'dashboard/operativo', element: <DashboardOperativoPage /> },
      { path: 'ayuda', element: protect(<AyudaPage />, { allowedRoles: ALL }) },
      { path: 'ventas', element: protect(<MatrizVentasPage />, { module: 'ventas' }) },
      { path: 'ventas/:id', element: protect(<VentaDetallePage />, { module: 'ventas' }) },
      { path: 'ventas/nueva', element: protect(<VentasFormPage />, { module: 'ventas', permission: 'write' }) },
      { path: 'ventas/:id/editar', element: protect(<VentasFormPage />, { module: 'ventas', permission: 'write' }) },
      { path: 'ventas/:id/imprimir', element: protect(<VentaPrintPage />, { module: 'ventas' }) },
      { path: 'asistente', element: protect(<AsistentePage />, { allowedRoles: ALL }) },
      { path: 'bodega', element: protect(<BodegaPage />, { module: 'bodega' }) },
      { path: 'bodega/picking', element: protect(<PanelPickingPage />, { module: 'bodega' }) },
      { path: 'bodega/packing', element: protect(<PanelPackingPage />, { module: 'bodega' }) },
      { path: 'bodega/nuevo', element: protect(<BodegaFormPage />, { module: 'bodega', permission: 'write' }) },
      { path: 'bodega/:id/editar', element: protect(<BodegaFormPage />, { module: 'bodega', permission: 'write' }) },
      { path: 'importaciones', element: protect(<ImportacionesPage />, { module: 'bodega' }) },
      { path: 'ordenes-compra-proveedores', element: protect(<OrdenesCompraProveedoresPage />, { module: 'bodega' }) },
      { path: 'taller', element: protect(<TallerPage />, { module: 'taller' }) },
      { path: 'taller/nueva', element: protect(<TallerFormPage />, { module: 'taller', permission: 'write' }) },
      { path: 'taller/:id', element: protect(<TallerFormPage />, { module: 'taller' }) },
      { path: 'taller/:id/editar', element: protect(<TallerFormPage />, { module: 'taller', permission: 'write' }) },
      { path: 'taller-operario', element: protect(<TallerOperarioPage />, { module: 'taller' }) },
      { path: 'taller-corte', element: protect(<TallerCortePage />, { module: 'taller' }) },
      { path: 'odt', element: protect(<OdtLegacyRedirect />, { module: 'taller' }) },
      { path: 'odts/:id', element: protect(<OdtLegacyRedirect />, { module: 'taller' }) },
      { path: 'caja', element: protect(<CajaPage />, { module: 'caja' }) },
      { path: 'caja/nuevo', element: protect(<CajaFormPage />, { module: 'caja', permission: 'write' }) },
      { path: 'clientes', element: protect(<ClientesPage />, { module: 'clientes' }) },
      { path: 'clientes/nuevo', element: protect(<ClientesFormPage />, { module: 'clientes', permission: 'write' }) },
      { path: 'clientes/:id', element: protect(<ClienteDetallePage />, { module: 'clientes' }) },
      { path: 'clientes/:id/editar', element: protect(<ClientesFormPage />, { module: 'clientes', permission: 'write' }) },
      { path: 'cobranza/*', element: protect(<CobranzaPage />, { module: 'cobranza' }) },
      { path: 'licitaciones', element: protect(<LicitacionesLegacyRedirect />, { module: 'ventas' }) },
      { path: 'licitaciones/nueva', element: protect(<LicitacionesLegacyRedirect destination="nueva" />, { module: 'ventas', permission: 'write' }) },
      { path: 'licitaciones/:id/ficha', element: protect(<LicitacionFichaPage />, { module: 'licitaciones' }) },
      { path: 'licitaciones/:id', element: protect(<LicitacionDetallePage />, { module: 'licitaciones' }) },
      { path: 'ordenes-compra', element: protect(<OrdenesCompraPage />, { module: 'ventas' }) },
      { path: 'ordenes-compra/:id', element: protect(<OrdenCompraDetallePage />, { module: 'ventas' }) },
      { path: 'pagos-proveedores', element: protect(<PagosProveedoresPage />, { module: 'proveedores' }) },
      { path: 'pagos-proveedores/:id', element: protect(<PagoProveedorDetallePage />, { module: 'proveedores' }) },
      { path: 'telas', element: protect(<TelasPage />, { module: 'taller' }) },
      { path: 'telas/:id', element: protect(<TelaDetallePage />, { module: 'taller' }) },
      { path: 'bodega-taller', element: protect(<BodegaTallerPage />, { module: 'taller' }) },
      { path: 'costeo', element: protect(<CosteoPage />, { module: 'costeo' }) },
      { path: 'materias-primas/nueva', element: protect(<MateriaPrimaFormPage />, { requirements: [['taller', 'write'], ['costeo', 'write']] }) },
      { path: 'materias-primas/:id', element: protect(<MateriaPrimaFormPage />, { requirements: [['taller', 'read'], ['costeo', 'read']] }) },
      { path: 'materias-primas/:id/editar', element: protect(<MateriaPrimaFormPage />, { requirements: [['taller', 'write'], ['costeo', 'write']] }) },
      { path: 'accesos',    element: <Navigate to="/usuarios" replace /> },
      { path: 'usuarios',   element: <ProtectedRoute allowedRoles={['admin']}><UsuariosPage /></ProtectedRoute> },
      { path: 'usuarios/nuevo', element: <ProtectedRoute allowedRoles={['admin']}><UsuarioFormPage /></ProtectedRoute> },
      { path: 'usuarios/:id', element: <ProtectedRoute allowedRoles={['admin']}><UsuarioFormPage /></ProtectedRoute> },
      { path: 'usuarios/:id/editar', element: <ProtectedRoute allowedRoles={['admin']}><UsuarioFormPage /></ProtectedRoute> },
      { path: 'descuentos', element: protect(<DescuentosPage />, { module: 'descuentos', permission: 'write' }) },
      { path: 'proveedores', element: protect(<ProveedoresPage />, { module: 'proveedores' }) },
      { path: 'proveedores/:id', element: protect(<ProveedorDetallePage />, { module: 'proveedores' }) },
      { path: 'crm', element: protect(<CrmPage />, { module: 'ventas' }) },
      { path: 'crm/nueva', element: <Navigate to="/crm" replace /> },
      { path: 'crm/nueva/licitacion', element: protect(<VentasFormPage crmMode forceTipo="Licitación" />, { module: 'ventas', permission: 'write' }) },
      { path: 'crm/nueva/compra-agil', element: protect(<VentasFormPage crmMode forceTipo="Compra Ágil" crmQuoteMode="COMPRA_AGIL" />, { module: 'ventas', permission: 'write' }) },
      { path: 'crm/nueva/cotizacion-simple', element: protect(<VentasFormPage crmMode forceTipo="Venta Web" crmQuoteMode="PROSPECCION_DIRECTA" />, { module: 'ventas', permission: 'write' }) },
      { path: 'crm/:id/gestion', element: protect(<CrmGestionDetallePage />, { module: 'ventas' }) },
      { path: 'config',        element: <ProtectedRoute allowedRoles={['admin']}><ConfigPage /></ProtectedRoute> },
      { path: 'matriz-ventas', element: <Navigate to="/ventas" replace /> },
      { path: 'despachos', element: protect(<DespachosPage />, { module: 'despacho' }) },
      { path: 'despachos/nuevo', element: protect(<DespachoFormPage />, { module: 'despacho', permission: 'write' }) },
      { path: 'despachos/:id/editar', element: protect(<DespachoFormPage />, { module: 'despacho', permission: 'write' }) },
      { path: 'despachos/ordenes/:ordenId/picking', element: protect(<PickingConfirmPage />, { module: 'despacho', permission: 'write' }) },
      { path: 'despachos/ordenes/:ordenId/packing', element: protect(<DespachoPackingPage />, { module: 'despacho', permission: 'write' }) },
      { path: 'despachos/:id/tracking', element: protect(<DespachoTrackingPage />, { module: 'despacho' }) },
      { path: 'despachos/guias/nueva', element: protect(<GuiaFormPage />, { module: 'despacho', permission: 'write' }) },
      { path: 'despachos/guias/:id/editar', element: protect(<GuiaFormPage />, { module: 'despacho', permission: 'write' }) },
      { path: 'despachos/guias/:id/imprimir', element: protect(<GuiaPrintPage />, { module: 'despacho' }) },
      { path: 'facturacion/documentos', element: protect(<DocumentosPage />, { module: 'facturacion' }) },
      { path: 'facturacion/recibidos', element: protect(<DocumentosRecibidosPage />, { module: 'facturacion' }) },
      { path: 'facturacion/emitir', element: protect(<EmitirManualPage />, { module: 'facturacion', permission: 'write' }) },
      { path: 'facturacion/factura-compra', element: protect(<EmitirFacturaCompraPage />, { module: 'facturacion', permission: 'write' }) },
      { path: 'facturacion/liquidacion', element: protect(<EmitirLiquidacionPage />, { module: 'facturacion', permission: 'write' }) },
      { path: 'facturacion/exportacion', element: protect(<EmitirExportacionPage />, { module: 'facturacion', permission: 'write' }) },
      { path: 'facturacion/configuracion', element: protect(<ConfiguracionPage />, { module: 'facturacion' }) },
      { path: 'bitacora-taller', element: protect(<BitacoraTallerPage />, { module: 'taller' }) },
      { path: 'historial-materiales', element: protect(<HistorialMaterialesPage />, { module: 'taller' }) },
      { path: 'stock-ingresos', element: protect(<StockIngresosPage />, { module: 'bodega' }) },
      { path: 'excepciones-taller', element: protect(<PasarTallerPage />, { requirements: [['taller', 'write'], ['ventas', 'write']] }) },
      { path: 'pasar-taller', element: <PasarTallerLegacyRedirect /> },
      { path: 'consulta-precios', element: protect(<ConsultaPreciosPage />, { module: 'catalogo' }) },
      { path: 'reportes/gerenciales', element: protect(<ReportesGerencialesPage />, { module: 'reportes' }) },
      { path: 'reportes/comisiones', element: <ProtectedRoute allowedRoles={['admin']}><ReportesComisionesPage /></ProtectedRoute> },
      { path: 'reportes/movimientos-anormales', element: protect(<ReportesMovimientosAnormalesPage />, { module: 'bodega' }) },
      { path: 'reportes/licitaciones', element: protect(<LicitacionesLegacyRedirect destination="reportes" />, { module: 'reportes' }) },
      { path: 'rrhh', element: protect(<RrhhPage />, { module: 'rrhh' }) },
      { path: 'rrhh/nuevo', element: protect(<TrabajadorFormPage />, { module: 'rrhh', permission: 'write' }) },
      { path: 'rrhh/:id', element: protect(<TrabajadorDetallePage />, { module: 'rrhh' }) },
      { path: 'rrhh/:id/editar', element: protect(<TrabajadorFormPage />, { module: 'rrhh', permission: 'write' }) },
      { path: 'admin/integridad', element: <ProtectedRoute allowedRoles={['admin']}><IntegridadPage /></ProtectedRoute> },
      { path: 'admin/comisiones', element: <ProtectedRoute allowedRoles={['admin']}><ComisionesPage /></ProtectedRoute> },
      { path: 'admin/auditoria',  element: <ProtectedRoute allowedRoles={['admin']}><AuditoriaPage /></ProtectedRoute> },
      { path: 'admin/historico',  element: <ProtectedRoute allowedRoles={['admin']}><HistoricoPage /></ProtectedRoute> },
      { path: 'admin/saneamiento-legacy', element: <ProtectedRoute allowedRoles={['admin']}><SaneamientoLegacyPage /></ProtectedRoute> },
      { path: 'admin/ia-balance', element: <ProtectedRoute allowedRoles={['admin']}><IaBalancePage /></ProtectedRoute> },
      { path: 'admin/excepciones', element: <ProtectedRoute allowedRoles={['admin']}><ExcepcionesPage /></ProtectedRoute> },
      { path: 'admin/feedback', element: <ProtectedRoute allowedRoles={['admin']}><PilotFeedbackPage /></ProtectedRoute> },

    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
