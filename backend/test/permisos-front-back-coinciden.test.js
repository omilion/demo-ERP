// El front y el back declaran el mismo modelo de permisos en dos archivos
// distintos. Ya divergieron una vez: la pantalla de Accesos ofrecia el modulo
// 'cotizaciones' que el backend habia eliminado, y marcarlo devolvia 400.
//
// Este test compara ambos catalogos y falla si alguien toca uno y olvida el otro.
import { describe, expect, it } from 'vitest'
import { can as canBack } from '../src/middleware/rbac.js'
import { can as canFront, ROLE_PERMISSIONS } from '../../frontend/src/utils/permissions.js'

const ROLES = ['admin', 'vendedor', 'coordinador_comercial', 'bodeguero', 'cajero', 'taller', 'taller_operario', 'rrhh', 'solo_lectura']
const MODULOS = ['ventas', 'licitaciones', 'clientes', 'bodega', 'catalogo', 'despacho', 'taller',
  'caja', 'cobranza', 'rrhh', 'reportes', 'proveedores', 'descuentos', 'facturacion', 'costeo', 'usuarios', 'config', 'admin', 'ai']
const FUNCIONES = ['ventas.entregas', 'ventas.taller', 'ventas.crear', 'ventas.anular',
  'taller.avance', 'taller.gestion', 'taller.cerrar', 'taller.materiales',
  'facturacion.emitir', 'despacho.guias', 'bodega.movimientos', 'caja.pagos_proveedores']
const NIVELES = ['read', 'write', 'delete']

describe('el catalogo de roles es el mismo en front y back', () => {
  it('declara los mismos roles', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort())
  })
})

describe('can() resuelve igual en front y back', () => {
  it('coincide para cada rol, modulo y nivel', () => {
    const difieren = []
    for (const role of ROLES) {
      for (const modulo of [...MODULOS, ...FUNCIONES]) {
        for (const nivel of NIVELES) {
          const atras = canBack(role, modulo, nivel)
          const adelante = canFront({ role }, modulo, nivel)
          if (atras !== adelante) difieren.push(`${role} · ${modulo} · ${nivel}: back=${atras} front=${adelante}`)
        }
      }
    }
    expect(difieren).toEqual([])
  })

  it('coincide tambien con permisos extra por funcion', () => {
    const extra = { 'ventas.entregas': ['write'], 'taller.avance': ['write'] }
    const difieren = []
    for (const role of ROLES) {
      for (const modulo of [...MODULOS, ...FUNCIONES]) {
        for (const nivel of NIVELES) {
          const atras = canBack(role, modulo, nivel, extra)
          const adelante = canFront({ role, permisosExtra: extra }, modulo, nivel)
          if (atras !== adelante) difieren.push(`${role} · ${modulo} · ${nivel}: back=${atras} front=${adelante}`)
        }
      }
    }
    expect(difieren).toEqual([])
  })
})
