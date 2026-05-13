import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Shell } from './components/Shell'
import LoginPage from './pages/login/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import VentasPage from './pages/ventas/VentasPage'
import VentasFormPage from './pages/ventas/VentasFormPage'
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
      { path: 'licitaciones/*', element: <ProtectedRoute allowedRoles={['admin', 'vendedor', 'solo_lectura']}><LicitacionesPage /></ProtectedRoute> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
