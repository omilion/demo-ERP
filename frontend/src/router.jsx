import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Shell } from './components/Shell'
import LoginPage from './pages/login/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import VentasPage from './pages/ventas/VentasPage'
import BodegaPage from './pages/bodega/BodegaPage'
import TallerPage from './pages/taller/TallerPage'
import CajaPage from './pages/caja/CajaPage'
import ClientesPage from './pages/clientes/ClientesPage'
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
      { path: 'ventas/*',       element: <ProtectedRoute allowedRoles={['admin', 'vendedor']}><VentasPage /></ProtectedRoute> },
      { path: 'bodega/*',       element: <ProtectedRoute allowedRoles={['admin', 'bodeguero']}><BodegaPage /></ProtectedRoute> },
      { path: 'taller/*',       element: <ProtectedRoute allowedRoles={['admin', 'taller']}><TallerPage /></ProtectedRoute> },
      { path: 'caja/*',         element: <ProtectedRoute allowedRoles={['admin', 'cajero']}><CajaPage /></ProtectedRoute> },
      { path: 'clientes/*',     element: <ProtectedRoute allowedRoles={['admin', 'vendedor']}><ClientesPage /></ProtectedRoute> },
      { path: 'cobranza/*',     element: <ProtectedRoute allowedRoles={['admin', 'cajero']}><CobranzaPage /></ProtectedRoute> },
      { path: 'licitaciones/*', element: <ProtectedRoute allowedRoles={['admin', 'vendedor']}><LicitacionesPage /></ProtectedRoute> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
