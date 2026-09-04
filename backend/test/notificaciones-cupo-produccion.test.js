import { describe, expect, it } from 'vitest'
import { seleccionarNotificacionesConCupo } from '../src/routes/notificaciones/index.js'

describe('Notificaciones: cupo garantizado para produccion operativa', () => {
  it('garantiza visibilidad de produccion reciente aun con mas de 100 alertas altas', () => {
    // 120 alertas de severidad alta
    const altas = Array.from({ length: 120 }, (_, i) => ({
      tipo: 'stock_critico',
      severidad: 'alta',
      titulo: `Stock critico #${i + 1}`,
      fecha: new Date(Date.now() - (150 - i) * 86400000).toISOString(),
    }))

    // Alerta critica más antigua/urgente
    const alertaCriticaTop = altas[0]

    // 5 avisos de produccion terminada por taller (severidad media)
    const produccion = [
      {
        tipo: 'odt_lista_despacho',
        severidad: 'media',
        titulo: 'Lista para picking: OT #999',
        fecha: new Date(Date.now() - 1000).toISOString(), // hace 1 segundo
      },
      {
        tipo: 'odt_parcial_picking',
        severidad: 'media',
        titulo: 'Picking parcial disponible: OT #998',
        fecha: new Date(Date.now() - 2000).toISOString(),
      },
    ]

    // Otras alertas de severidad media y baja
    const resto = [
      { tipo: 'crm_seguimiento', severidad: 'media', titulo: 'Lead #1', fecha: new Date().toISOString() },
      { tipo: 'cumpleanos', severidad: 'baja', titulo: 'Cumpleaños', fecha: new Date().toISOString() },
    ]

    const todos = [...resto, ...produccion, ...altas]
    const resultado = seleccionarNotificacionesConCupo(todos, 100)

    // 1. El límite total se respeta estrictamente
    expect(resultado).toHaveLength(100)

    // 2. Una alerta crítica de alta severidad no desaparece
    expect(resultado[0]).toEqual(alertaCriticaTop)

    // 3. Los avisos de produccion relevantes para bodega aparecen
    const avisosProduccionEnResultado = resultado.filter(x =>
      x.tipo === 'odt_lista_despacho' || x.tipo === 'odt_parcial_picking'
    )
    expect(avisosProduccionEnResultado.length).toBeGreaterThanOrEqual(2)
    expect(avisosProduccionEnResultado.some(x => x.titulo.includes('OT #999'))).toBe(true)

    // 4. Se conserva el orden lógico: críticas primero, luego producción reciente, luego el resto
    const primerIdxAlta = resultado.findIndex(x => x.severidad === 'alta')
    const primerIdxProd = resultado.findIndex(x => x.tipo === 'odt_lista_despacho')
    expect(primerIdxAlta).toBe(0)
    expect(primerIdxProd).toBeGreaterThan(primerIdxAlta)
  })

  it('respeta el limite cuando hay menos elementos que el limite', () => {
    const items = [
      { tipo: 'odt_lista_despacho', severidad: 'media', titulo: 'OT #1', fecha: new Date().toISOString() },
      { tipo: 'stock_critico', severidad: 'alta', titulo: 'Stock #1', fecha: new Date().toISOString() },
    ]
    const resultado = seleccionarNotificacionesConCupo(items, 50)
    expect(resultado).toHaveLength(2)
    expect(resultado[0].tipo).toBe('stock_critico')
    expect(resultado[1].tipo).toBe('odt_lista_despacho')
  })

  it('no desborda el limite con límites pequeños personalizados', () => {
    const altas = Array.from({ length: 30 }, (_, i) => ({
      tipo: 'factura_vencida',
      severidad: 'alta',
      titulo: `Factura #${i}`,
      fecha: new Date(Date.now() - (30 - i) * 86400000).toISOString(),
    }))
    const produccion = [
      { tipo: 'odt_lista_despacho', severidad: 'media', titulo: 'OT #Recent', fecha: new Date().toISOString() },
    ]
    const resultado = seleccionarNotificacionesConCupo([...altas, ...produccion], 10)
    expect(resultado).toHaveLength(10)
    expect(resultado.some(x => x.titulo === 'OT #Recent')).toBe(true)
  })
})
