import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import corsPlugin from './plugins/cors.js'
import cookiePlugin from './plugins/cookie.js'
import jwtPlugin from './plugins/jwt.js'
import prismaPlugin from './plugins/prisma.js'
import auditPlugin from './plugins/audit.js'
import multipartPlugin from './plugins/multipart.js'
import authRoutes from './routes/auth/index.js'
import productosRoutes from './routes/productos/index.js'
import clientesRoutes from './routes/clientes/index.js'
import ventasRoutes from './routes/ventas/index.js'
import odtsRoutes from './routes/odts/index.js'
import cajaRoutes from './routes/caja/index.js'
import dashboardStats from './routes/dashboard/stats.js'
import proveedoresRoutes from './routes/proveedores/index.js'
import crmRoutes from './routes/crm/index.js'
import cobranzaHistoricoRoutes from './routes/cobranza/index.js'
import locationsRoutes from './routes/locations/index.js'
import categoriasRoutes from './routes/categorias/index.js'
import ubicacionesRoutes from './routes/ubicaciones/index.js'
import cotizacionesRoutes from './routes/cotizaciones/index.js'
import ordenesCompraRoutes from './routes/ordenes-compra/index.js'
import pagosProveedoresRoutes from './routes/pagos-proveedores/index.js'
import telasRoutes from './routes/telas/index.js'
import bodegaTallerRoutes from './routes/bodega-taller/index.js'
import accesosRoutes from './routes/accesos/index.js'
import descuentosRoutes from './routes/descuentos/index.js'
import configRoutes from './routes/config/index.js'
import matrizVentasRoutes from './routes/matriz-ventas/index.js'
import cargoTransporteRoutes from './routes/cargo-transporte/index.js'
import gastosRoutes from './routes/gastos/index.js'
import bitacoraTallerRoutes from './routes/bitacora-taller/index.js'
import historialMaterialesRoutes from './routes/historial-materiales/index.js'
import despachosRoutes from './routes/despachos/index.js'
import pasarTallerRoutes from './routes/pasar-taller/index.js'
import stockIngresosRoutes from './routes/stock-ingresos/index.js'
import categoriasBodegaTallerRoutes from './routes/categorias-bodega-taller/index.js'
import reportesRoutes from './routes/reportes/index.js'
import multasRoutes from './routes/multas/index.js'
import usuariosRoutes from './routes/usuarios/index.js'
import bannersRoutes from './routes/banners/index.js'
import usuariosWebRoutes from './routes/usuarios-web/index.js'
import rrhhRoutes from './routes/rrhh/index.js'
import adminRoutes from './routes/admin/index.js'
import historicoRoutes from './routes/historico/index.js'
import notificacionesRoutes from './routes/notificaciones/index.js'
import uploadsRoutes from './routes/uploads/index.js'
import aiRoutes from './routes/ai/index.js'
import facturacionRoutes from './routes/facturacion/index.js'
import costeoRoutes from './routes/costeo/index.js'
import tallerCorteRoutes from './routes/taller-corte/index.js'
import notasInternasRoutes from './routes/notas-internas/index.js'
import importacionesRoutes from './routes/importaciones/index.js'
import ordenesCompraProveedoresRoutes from './routes/ordenes-compra-proveedores/index.js'
import excepcionesRoutes from './routes/excepciones/index.js'
import { decorateRbac } from './middleware/rbac.js'
import { isErpAccessToken } from './plugins/jwt.js'

export function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true })

  // Decorate synchronously so decorators are available before app.ready()
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    if (!isErpAccessToken(request.user)) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    // La sesión refresh no protege el bearer token ya emitido. Contrastamos una
    // versión de autorización persistida para que una baja o cambio de permisos
    // lo deje inválido en la siguiente llamada, sin esperar su expiración JWT.
    const user = await app.prisma.user.findUnique({
      where: { id: Number(request.user.id) },
      select: { activo: true, authVersion: true },
    })
    if (!user || !user.activo || Number(user.authVersion || 0) !== Number(request.user.authVersion || 0)) {
      return reply.status(401).send({ error: 'Session revoked' })
    }
  })
  decorateRbac(app)

  app.register(corsPlugin)
  app.register(cookiePlugin)
  app.register(jwtPlugin)
  app.register(prismaPlugin)
  app.register(auditPlugin)
  app.register(multipartPlugin)
  app.register(authRoutes, { prefix: '/api/auth' })
  app.register(productosRoutes, { prefix: '/api/productos' })
  app.register(clientesRoutes, { prefix: '/api/clientes' })
  app.register(ventasRoutes, { prefix: '/api/ventas' })
  app.register(odtsRoutes, { prefix: '/api/odts' })
  app.register(cajaRoutes, { prefix: '/api/caja' })
  app.register(dashboardStats, { prefix: '/api/dashboard' })
  app.register(proveedoresRoutes, { prefix: '/api/proveedores' })
  app.register(crmRoutes, { prefix: '/api/crm' })
  app.register(cobranzaHistoricoRoutes, { prefix: '/api/cobranza-historico' })
  app.register(locationsRoutes, { prefix: '/api/locations' })
  app.register(categoriasRoutes, { prefix: '/api/categorias' })
  app.register(ubicacionesRoutes, { prefix: '/api/ubicaciones' })
  app.register(cotizacionesRoutes, { prefix: '/api/cotizaciones' })
  app.register(ordenesCompraRoutes, { prefix: '/api/ordenes-compra' })
  app.register(pagosProveedoresRoutes, { prefix: '/api/pagos-proveedores' })
  app.register(telasRoutes, { prefix: '/api/telas' })
  app.register(bodegaTallerRoutes, { prefix: '/api/bodega-taller' })
  app.register(accesosRoutes, { prefix: '/api/accesos' })
  app.register(descuentosRoutes, { prefix: '/api/descuentos' })
  app.register(configRoutes, { prefix: '/api/config' })
  app.register(matrizVentasRoutes, { prefix: '/api/matriz-ventas' })
  app.register(cargoTransporteRoutes, { prefix: '/api/cargo-transporte' })
  app.register(gastosRoutes, { prefix: '/api/gastos' })
  app.register(bitacoraTallerRoutes, { prefix: '/api/bitacora-taller' })
  app.register(historialMaterialesRoutes, { prefix: '/api/historial-materiales' })
  app.register(despachosRoutes, { prefix: '/api/despachos' })
  app.register(pasarTallerRoutes, { prefix: '/api/pasar-taller' })
  app.register(stockIngresosRoutes, { prefix: '/api/stock-ingresos' })
  app.register(categoriasBodegaTallerRoutes, { prefix: '/api/categorias-bodega-taller' })
  app.register(reportesRoutes, { prefix: '/api/reportes' })
  app.register(multasRoutes, { prefix: '/api/multas' })
  app.register(usuariosRoutes, { prefix: '/api/usuarios' })
  app.register(bannersRoutes, { prefix: '/api/banners' })
  app.register(usuariosWebRoutes, { prefix: '/api/usuarios-web' })
  app.register(rrhhRoutes, { prefix: '/api/rrhh' })
  app.register(adminRoutes, { prefix: '/api/admin' })
  app.register(historicoRoutes, { prefix: '/api/historico' })
  app.register(notificacionesRoutes, { prefix: '/api/notificaciones' })
  app.register(aiRoutes, { prefix: '/api/ai' })
  app.register(facturacionRoutes, { prefix: '/api/facturacion' })
  app.register(costeoRoutes, { prefix: '/api/costeo' })
  app.register(tallerCorteRoutes, { prefix: '/api/taller-corte' })
  app.register(notasInternasRoutes, { prefix: '/api/notas-internas' })
  app.register(importacionesRoutes, { prefix: '/api/importaciones' })
  app.register(ordenesCompraProveedoresRoutes, { prefix: '/api/ordenes-compra-proveedores' })
  app.register(excepcionesRoutes, { prefix: '/api/excepciones' })
  app.register(uploadsRoutes, { prefix: '/uploads' })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}

const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] && process.argv[1].replace(/\\/g, '/') === __filename.replace(/\\/g, '/')) {
  const app = buildApp()
  try {
    await app.listen({ port: Number(process.env.PORT) || 3001, host: process.env.HOST || '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
