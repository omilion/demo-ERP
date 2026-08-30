// El permiso 'ai' habilita el asistente; NO es una llave a los datos.
//
// Al hacer que 'ai' gobernara el asistente -antes era un role === 'admin' fijo-
// se abrio una via de escalada: asignar ai:read desde Accesos entregaba las 14
// herramientas de negocio, incluida consultar_planillas, que devuelve sueldos
// por trabajador. Un rol sin permiso de rrhh alcanzaba las remuneraciones.
//
// Lo detecto Sebastian en la auditoria cruzada del 30-08-2026.
import { describe, expect, it } from 'vitest'
import { permisoDeHerramienta } from '../src/routes/ai/tools/index.js'
import { can } from '../src/middleware/rbac.js'

// Replica la decision de runTool sin tocar la base.
const alcanza = (role, extra, herramienta) => {
  const modulo = permisoDeHerramienta(herramienta)
  return !modulo || can(role, modulo, 'read', extra)
}

const conAi = { ai: ['read'] }

describe('cada herramienta exige el permiso del modulo que consulta', () => {
  it('las sensibles estan declaradas', () => {
    expect(permisoDeHerramienta('consultar_planillas')).toBe('rrhh')
    expect(permisoDeHerramienta('consultar_rrhh')).toBe('rrhh')
    expect(permisoDeHerramienta('consultar_caja')).toBe('caja')
    expect(permisoDeHerramienta('consultar_comisiones')).toBe('ventas')
  })

  // La de documentacion no lee datos del negocio: no exige modulo.
  it('la documentacion no exige permiso de dominio', () => {
    expect(permisoDeHerramienta('consultar_documentacion')).toBeNull()
  })
})

describe('ai:read no abre las remuneraciones', () => {
  it('una cortadora con ai:read no alcanza sueldos ni caja', () => {
    expect(alcanza('taller_operario', conAi, 'consultar_planillas')).toBe(false)
    expect(alcanza('taller_operario', conAi, 'consultar_rrhh')).toBe(false)
    expect(alcanza('taller_operario', conAi, 'consultar_caja')).toBe(false)
  })

  it('tampoco un vendedor ni un bodeguero', () => {
    for (const rol of ['vendedor', 'bodeguero', 'solo_lectura']) {
      expect(alcanza(rol, conAi, 'consultar_planillas'), rol).toBe(rol === 'solo_lectura')
    }
  })

  // Lo que si debe pasar: cada quien consulta su propia area.
  it('cada rol alcanza lo suyo y solo lo suyo', () => {
    expect(alcanza('rrhh', conAi, 'consultar_planillas')).toBe(true)
    expect(alcanza('rrhh', conAi, 'consultar_caja')).toBe(false)

    expect(alcanza('cajero', conAi, 'consultar_caja')).toBe(true)
    expect(alcanza('cajero', conAi, 'consultar_planillas')).toBe(false)

    expect(alcanza('taller_operario', conAi, 'consultar_taller')).toBe(true)
  })

  it('gerencia alcanza todo, como antes', () => {
    for (const t of ['consultar_planillas', 'consultar_caja', 'consultar_comisiones', 'consultar_taller']) {
      expect(alcanza('admin', null, t), t).toBe(true)
    }
  })
})
