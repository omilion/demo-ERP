import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Shell } from './components/Shell'
import LoginPage from './pages/login/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
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
import LicitacionDetallePage from './pages/licitaciones/LicitacionDetallePage'
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
import UsuariosPage from './pages/usuarios/UsuariosPage'
import RrhhPage from './pages/rrhh/RrhhPage'

const ALL = ['admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura']

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
      { path: 'ventas',             element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><VentasPage /></ProtectedRoute> },
      { path: 'ventas/nueva',       element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><VentasFormPage /></ProtectedRoute> },
      { path: 'ventas/:id/editar',  element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><VentasFormPage /></ProtectedRoute> },
      { path: 'ventas/:id/imprimir', element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><VentaPrintPage /></ProtectedRoute> },
      { path: 'bodega',             element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'solo_lectura']}><BodegaPage /></ProtectedRoute> },
      { path: 'bodega/nuevo',       element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'solo_lectura']}><BodegaFormPage /></ProtectedRoute> },
      { path: 'bodega/:id/editar', element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'solo_lectura']}><BodegaFormPage /></ProtectedRoute> },
      { path: 'taller',             element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><TallerPage /></ProtectedRoute> },
      { path: 'taller/nueva',       element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><TallerFormPage /></ProtectedRoute> },
      { path: 'taller/:id/editar',  element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><TallerFormPage /></ProtectedRoute> },
      { path: 'caja',               element: <ProtectedRoute allowedRoles={['admin', 'cajero', 'solo_lectura']}><CajaPage /></ProtectedRoute> },
      { path: 'caja/nuevo',         element: <ProtectedRoute allowedRoles={['admin', 'cajero', 'solo_lectura']}><CajaFormPage /></ProtectedRoute> },
      { path: 'clientes',               element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'rrhh', 'solo_lectura']}><ClientesPage /></ProtectedRoute> },
      { path: 'clientes/nuevo',         element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'rrhh', 'solo_lectura']}><ClientesFormPage /></ProtectedRoute> },
      { path: 'clientes/:id/editar',    element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'rrhh', 'solo_lectura']}><ClientesFormPage /></ProtectedRoute> },
      { path: 'cobranza/*',     element: <ProtectedRoute allowedRoles={['admin', 'cajero', 'solo_lectura']}><CobranzaPage /></ProtectedRoute> },
      { path: 'licitaciones',     element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><LicitacionesPage /></ProtectedRoute> },
      { path: 'licitaciones/:id', element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><LicitacionDetallePage /></ProtectedRoute> },
      { path: 'ordenes-compra',     element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><OrdenesCompraPage /></ProtectedRoute> },
      { path: 'ordenes-compra/:id', element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><OrdenCompraDetallePage /></ProtectedRoute> },
      { path: 'pagos-proveedores',     element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'solo_lectura']}><PagosProveedoresPage /></ProtectedRoute> },
      { path: 'pagos-proveedores/:id', element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'solo_lectura']}><PagoProveedorDetallePage /></ProtectedRoute> },
      { path: 'telas',     element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><TelasPage /></ProtectedRoute> },
      { path: 'telas/:id', element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><TelaDetallePage /></ProtectedRoute> },
      { path: 'bodega-taller', element: <ProtectedRoute allowedRoles={['admin', 'taller', 'bodeguero', 'solo_lectura']}><BodegaTallerPage /></ProtectedRoute> },
      { path: 'accesos',    element: <ProtectedRoute allowedRoles={['admin']}><AccesosPage /></ProtectedRoute> },
      { path: 'usuarios',   element: <ProtectedRoute allowedRoles={['admin']}><UsuariosPage /></ProtectedRoute> },
      { path: 'descuentos', element: <ProtectedRoute allowedRoles={['admin', 'vendedor']}><DescuentosPage /></ProtectedRoute> },
      { path: 'proveedores',   element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'solo_lectura']}><ProveedoresPage /></ProtectedRoute> },
      { path: 'crm',           element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><CrmPage /></ProtectedRoute> },
      { path: 'config',        element: <ProtectedRoute allowedRoles={['admin']}><ConfigPage /></ProtectedRoute> },
      { path: 'matriz-ventas', element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><MatrizVentasPage /></ProtectedRoute> },
      { path: 'despachos',     element: <ProtectedRoute allowedRoles={['admin', 'bodeguero', 'vendedor', 'solo_lectura']}><DespachosPage /></ProtectedRoute> },
      { path: 'bitacora-taller', element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><BitacoraTallerPage /></ProtectedRoute> },
      { path: 'historial-materiales', element: <ProtectedRoute allowedRoles={['admin', 'taller', 'solo_lectura']}><HistorialMaterialesPage /></ProtectedRoute> },
      { path: 'stock-ingresos', element: <ProtectedRoute allowedRoles={['admin', 'bodeguero']}><StockIngresosPage /></ProtectedRoute> },
      { path: 'pasar-taller',  element: <ProtectedRoute allowedRoles={['admin', 'taller', 'vendedor']}><PasarTallerPage /></ProtectedRoute> },
      { path: 'consulta-precios', element: <ProtectedRoute allowedRoles={ALL}><ConsultaPreciosPage /></ProtectedRoute> },
      { path: 'reportes/licitaciones', element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><ReportesLicitacionesPage /></ProtectedRoute> },
      { path: 'rrhh', element: <ProtectedRoute allowedRoles={['admin', 'rrhh', 'solo_lectura']}><RrhhPage /></ProtectedRoute> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
