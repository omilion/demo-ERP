import fp from 'fastify-plugin'
import fjwt from '@fastify/jwt'

export const TOKEN_SCOPES = Object.freeze({
  ERP: 'erp',
  WEB: 'web',
})

export const TOKEN_AUDIENCES = Object.freeze({
  ERP: 'plastimar:erp',
  WEB: 'plastimar:web',
})

export const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
})

export function createErpAccessTokenPayload(user) {
  return {
    id: user.id,
    role: user.role,
    nombre: user.nombre,
    sucursalId: user.sucursalId ?? null,
    permisoDescuentos: !!user.permisoDescuentos,
    permisoAprobarDescuentos: !!user.permisoAprobarDescuentos,
    permisosExtra: user.permisosExtra || null,
    tiposVentaPermitidos: user.tiposVentaPermitidos || null,
    scope: TOKEN_SCOPES.ERP,
    aud: TOKEN_AUDIENCES.ERP,
    tokenType: TOKEN_TYPES.ACCESS,
  }
}

export function createErpRefreshTokenPayload(userId, jti) {
  return {
    id: userId,
    jti,
    scope: TOKEN_SCOPES.ERP,
    aud: TOKEN_AUDIENCES.ERP,
    tokenType: TOKEN_TYPES.REFRESH,
  }
}

export function createWebAccessTokenPayload(user) {
  return {
    id: user.id,
    email: user.email,
    scope: TOKEN_SCOPES.WEB,
    aud: TOKEN_AUDIENCES.WEB,
    tokenType: TOKEN_TYPES.ACCESS,
  }
}

export function isErpAccessToken(payload) {
  return payload?.scope === TOKEN_SCOPES.ERP
    && payload?.aud === TOKEN_AUDIENCES.ERP
    && payload?.tokenType === TOKEN_TYPES.ACCESS
}

export function isErpRefreshToken(payload) {
  return payload?.scope === TOKEN_SCOPES.ERP
    && payload?.aud === TOKEN_AUDIENCES.ERP
    && payload?.tokenType === TOKEN_TYPES.REFRESH
}

export default fp(async (fastify) => {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET is required')
  }

  fastify.register(fjwt, {
    secret: process.env.JWT_ACCESS_SECRET,
    sign: { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' },
  })
})
