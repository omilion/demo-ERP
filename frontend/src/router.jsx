import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Shell } from './components/Shell'
import { OdtLegacyRedirect, VentaLegacyRedirect } from './components/LegacyRedirects'
import LoginPage from './pages/login/LoginPage'
import DashboardPage, { DashboardOperativoPage } from './pages/dashboard/DashboardPage'
import VentasPage from './pages/ventas/VentasPage'
import VentasFormPage from './pages/ventas/VentasFormPage'
import VentaPrintPage from './pages/ventas/VentaPrintPage'
import BodegaPage from './pages/bodega/BodegaPage'
import BodegaFormPage from './pages/bodega/BodegaFormPage'
import TallerPage from './pages/taller/TallerPage'
import TallerFormPage from './pages/taller/TallerFormPage'
import CajaPage from './pages/caja/CajaPage'
import CajaFormPage from './pages/caja/CajaFormPage'
import ClientesPage from './pages/clientes/ClientesPage'
import ClientesFormPage from './pages/clientes/ClientesFormPage'
import CobranzaPage from './pages/cobranza/CobranzaPage'
import LicitacionesPage from './pages/licitaciones/LicitacionesPage'
import LicitacionFormPage from './pages/licitaciones/LicitacionFormPage'
import LicitacionDetallePage from './pages/licitaciones/LicitacionDetallePage'
import LicitacionFichaPage from './pages/licitaciones/LicitacionFichaPage'
import OrdenesCompraPage from './pages/ordenes-compra/OrdenesCompraPage'
import OrdenCompraDetallePage from './pages/ordenes-compra/OrdenCompraDetallePage'
import PagosProveedoresPage from './pages/pagos-proveedores/PagosProveedoresPage'
import PagoProveedorDetallePage from './pages/pagos-proveedores/PagoProveedorDetallePage'
import TelasPage from './pages/telas/TelasPage'
import TelaDetallePage from './pages/telas/TelaDetallePage'
import BodegaTallerPage from './pages/bodega-taller/BodegaTallerPage'
import AccesosPage from './pages/accesos/AccesosPage'
import DescuentosPage from './pages/descuentos/DescuentosPage'
import ProveedoresPage from './pages/proveedores/ProveedoresPage'
import CrmPage from './pages/crm/CrmPage'
import ConfigPage from './pages/config/ConfigPage'
import MatrizVentasPage from './pages/matriz-ventas/MatrizVentasPage'
import DespachosPage from './pages/despachos/DespachosPage'
import BitacoraTallerPage from './pages/bitacora-taller/BitacoraTallerPage'
import HistorialMaterialesPage from './pages/historial-materiales/HistorialMaterialesPage'
import StockIngresosPage from './pages/stock-ingresos/StockIngresosPage'
import PasarTallerPage from './pages/pasar-taller/PasarTallerPage'
import ConsultaPreciosPage from './pages/consulta-precios/ConsultaPreciosPage'
import ReportesLicitacionesPage from './pages/reportes-licitaciones/ReportesLicitacionesPage'
import ReportesGerencialesPage from './pages/reportes-gerenciales/ReportesGerencialesPage'
import UsuariosPage from './pages/usuarios/UsuariosPage'
import RrhhPage from './pages/rrhh/RrhhPage'
import IntegridadPage from './pages/admin/IntegridadPage'
import AuditoriaPage from './pages/admin/AuditoriaPage'
import HistoricoPage from './pages/admin/HistoricoPage'
import SaneamientoLegacyPage from './pages/admin/SaneamientoLegacyPage'

const ALL = ['admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura']

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
      { path: 'ventas', element: protect(<VentasPage />, { module: 'ventas' }) },
      { path: 'ventas/:id', element: protect(<VentaLegacyRedirect />, { module: 'ventas' }) },
      { path: 'ventas/nueva', element: protect(<VentasFormPage />, { module: 'ventas', permission: 'write' }) },
      { path: 'ventas/:id/editar', element: protect(<VentasFormPage />, { module: 'ventas', permission: 'write' }) },
      { path: 'ventas/:id/imprimir', element: protect(<VentaPrintPage />, { module: 'ventas' }) },
      { path: 'bodega', element: protect(<BodegaPage />, { module: 'bodega' }) },
      { path: 'bodega/nuevo', element: protect(<BodegaFormPage />, { module: 'bodega', permission: 'write' }) },
      { path: 'bodega/:id/editar', element: protect(<BodegaFormPage />, { module: 'bodega', permission: 'write' }) },
      { path: 'taller', element: protect(<TallerPage />, { module: 'taller' }) },
      { path: 'taller/nueva', element: protect(<TallerFormPage />, { module: 'taller', permission: 'write' }) },
      { path: 'taller/:id', element: protect(<OdtLegacyRedirect />, { module: 'taller' }) },
      { path: 'taller/:id/editar', element: protect(<TallerFormPage />, { module: 'taller', permission: 'write' }) },
      { path: 'odt', element: protect(<OdtLegacyRedirect />, { module: 'taller' }) },
      { path: 'odts/:id', element: protect(<OdtLegacyRedirect />, { module: 'taller' }) },
      { path: 'caja', element: protect(<CajaPage />, { module: 'caja' }) },
      { path: 'caja/nuevo', element: protect(<CajaFormPage />, { module: 'caja', permission: 'write' }) },
      { path: 'clientes', element: protect(<ClientesPage />, { module: 'clientes' }) },
      { path: 'clientes/nuevo', element: protect(<ClientesFormPage />, { module: 'clientes', permission: 'write' }) },
      { path: 'clientes/:id/editar', element: protect(<ClientesFormPage />, { module: 'clientes', permission: 'write' }) },
      { path: 'cobranza/*', element: protect(<CobranzaPage />, { module: 'cobranza' }) },
      { path: 'licitaciones', element: protect(<LicitacionesPage />, { module: 'licitaciones' }) },
      { path: 'licitaciones/nueva', element: protect(<LicitacionFormPage />, { module: 'licitaciones', permission: 'write' }) },
      { path: 'licitaciones/:id/ficha', element: protect(<LicitacionFichaPage />, { module: 'licitaciones' }) },
      { path: 'licitaciones/:id', element: protect(<LicitacionDetallePage />, { module: 'licitaciones' }) },
      { path: 'ordenes-compra', element: protect(<OrdenesCompraPage />, { module: 'ventas' }) },
      { path: 'ordenes-compra/:id', element: protect(<OrdenCompraDetallePage />, { module: 'ventas' }) },
      { path: 'pagos-proveedores', element: protect(<PagosProveedoresPage />, { module: 'proveedores' }) },
      { path: 'pagos-proveedores/:id', element: protect(<PagoProveedorDetallePage />, { module: 'proveedores' }) },
      { path: 'telas', element: protect(<TelasPage />, { module: 'taller' }) },
      { path: 'telas/:id', element: protect(<TelaDetallePage />, { module: 'taller' }) },
      { path: 'bodega-taller', element: protect(<BodegaTallerPage />, { module: 'taller' }) },
      { path: 'accesos',    element: <ProtectedRoute allowedRoles={['admin']}><AccesosPage /></ProtectedRoute> },
      { path: 'usuarios',   element: <ProtectedRoute allowedRoles={['admin']}><UsuariosPage /></ProtectedRoute> },
      { path: 'descuentos', element: protect(<DescuentosPage />, { module: 'descuentos', permission: 'write' }) },
      { path: 'proveedores', element: protect(<ProveedoresPage />, { module: 'proveedores' }) },
      { path: 'crm', element: protect(<CrmPage />, { module: 'ventas' }) },
      { path: 'config',        element: <ProtectedRoute allowedRoles={['admin']}><ConfigPage /></ProtectedRoute> },
      { path: 'matriz-ventas', element: protect(<MatrizVentasPage />, { module: 'ventas' }) },
      { path: 'despachos', element: protect(<DespachosPage />, { module: 'despacho' }) },
      { path: 'bitacora-taller', element: protect(<BitacoraTallerPage />, { module: 'taller' }) },
      { path: 'historial-materiales', element: protect(<HistorialMaterialesPage />, { module: 'taller' }) },
      { path: 'stock-ingresos', element: protect(<StockIngresosPage />, { module: 'bodega' }) },
      { path: 'pasar-taller', element: protect(<PasarTallerPage />, { requirements: [['taller', 'write'], ['ventas', 'write']] }) },
      { path: 'consulta-precios', element: protect(<ConsultaPreciosPage />, { module: 'catalogo' }) },
      { path: 'reportes/gerenciales', element: protect(<ReportesGerencialesPage />, { module: 'reportes' }) },
      { path: 'reportes/licitaciones', element: protect(<ReportesLicitacionesPage />, { module: 'licitaciones' }) },
      { path: 'rrhh', element: protect(<RrhhPage />, { module: 'rrhh' }) },
      { path: 'admin/integridad', element: <ProtectedRoute allowedRoles={['admin']}><IntegridadPage /></ProtectedRoute> },
      { path: 'admin/auditoria',  element: <ProtectedRoute allowedRoles={['admin']}><AuditoriaPage /></ProtectedRoute> },
      { path: 'admin/historico',  element: <ProtectedRoute allowedRoles={['admin']}><HistoricoPage /></ProtectedRoute> },
      { path: 'admin/saneamiento-legacy', element: <ProtectedRoute allowedRoles={['admin']}><SaneamientoLegacyPage /></ProtectedRoute> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
