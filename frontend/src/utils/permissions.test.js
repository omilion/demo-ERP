import { describe, expect, it } from 'vitest'
import { can } from './permissions'

const user = (role, permisosExtra = null) => ({ role, permisosExtra })

describe('frontend permissions map', () => {
  it('keeps bodeguero aligned with backend stock permissions', () => {
    expect(can(user('bodeguero'), 'bodega', 'read')).toBe(true)
    expect(can(user('bodeguero'), 'bodega', 'write')).toBe(true)
    expect(can(user('bodeguero'), 'bodega', 'delete')).toBe(false)
  })

  it('allows read-only users to inspect proveedores without write actions', () => {
    expect(can(user('solo_lectura'), 'proveedores', 'read')).toBe(true)
    expect(can(user('solo_lectura'), 'proveedores', 'write')).toBe(false)
  })

  it('exposes gerencial reports as read-only across operational roles', () => {
    for (const role of ['vendedor', 'bodeguero', 'cajero', 'taller', 'solo_lectura']) {
      expect(can(user(role), 'reportes', 'read')).toBe(true)
      expect(can(user(role), 'reportes', 'write')).toBe(false)
    }
  })

  it('supports delegated delete permissions for operational modules', () => {
    expect(can(user('vendedor'), 'ventas', 'delete')).toBe(false)
    expect(can(user('vendedor', { ventas: ['delete'] }), 'ventas', 'delete')).toBe(true)
  })

  it('keeps coordinador_comercial with the exact same module permissions as vendedor', () => {
    for (const [modulo, permiso] of [['ventas', 'read'], ['ventas', 'write'], ['clientes', 'write'], ['catalogo', 'read'], ['rrhh', 'read']]) {
      expect(can(user('coordinador_comercial'), modulo, permiso)).toBe(can(user('vendedor'), modulo, permiso))
    }
  })
})
